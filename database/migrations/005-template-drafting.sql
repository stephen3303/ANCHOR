-- Drafts are not incoming C2OIX artifacts. Only final release publishes the same
-- ID into main's immutable artifact-backed messages table, in one transaction.
CREATE TABLE IF NOT EXISTS command_routing (
    command_id uuid PRIMARY KEY REFERENCES commands(id) ON DELETE RESTRICT,
    workflows jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(workflows)='array'),
    authorities jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(authorities)='array'),
    settings jsonb NOT NULL DEFAULT '{"textCase":"mixed","sequencePrefix":"#","sequenceDigits":4,"nextSequence":1}' CHECK (jsonb_typeof(settings)='object'),
    revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outgoing_messages (
    id text PRIMARY KEY,
    draft_id uuid NOT NULL UNIQUE REFERENCES message_drafts(id) ON DELETE RESTRICT,
    created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    command_id uuid NOT NULL REFERENCES commands(id) ON DELETE RESTRICT,
    request_id uuid NOT NULL,
    request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    received_at timestamptz NOT NULL,
    record jsonb NOT NULL CHECK (jsonb_typeof(record)='object'),
    workflow_status text NOT NULL DEFAULT 'drafting' CHECK (workflow_status IN ('drafting','in_routing','returned','released','withdrawn')),
    routing_revision integer NOT NULL DEFAULT 1 CHECK (routing_revision>0),
    routing_route jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(routing_route)='array'),
    workflow_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    released_at timestamptz,
    released_by uuid REFERENCES users(id) ON DELETE RESTRICT,
    release_sequence bigint,
    UNIQUE (created_by,request_id),
    UNIQUE (command_id,release_sequence),
    CHECK (id=draft_id::text AND record->>'id' IS NOT NULL AND record->>'id'=id),
    CHECK (record->>'kind' IS NOT NULL AND
        ((workflow_status='released' AND record->>'kind'='released' AND released_at IS NOT NULL AND released_by IS NOT NULL AND release_sequence IS NOT NULL)
        OR (workflow_status<>'released' AND record->>'kind'='draft' AND released_at IS NULL AND released_by IS NULL AND release_sequence IS NULL)))
);
CREATE INDEX outgoing_messages_scope_idx ON outgoing_messages(command_id,workflow_status);
CREATE TABLE outgoing_message_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    message_id text NOT NULL REFERENCES outgoing_messages(id) ON DELETE RESTRICT,
    actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_name text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('created','submitted','advanced','returned','revised','released','withdrawn')),
    step_title text,
    comment text NOT NULL DEFAULT '',
    revision integer NOT NULL,
    snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
    at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outgoing_message_events_message_idx ON outgoing_message_events(message_id,sequence);
CREATE TRIGGER outgoing_message_events_append_only BEFORE UPDATE OR DELETE ON outgoing_message_events FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER outgoing_message_events_no_truncate BEFORE TRUNCATE ON outgoing_message_events FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();

-- Import, don't delete, the original branch's saved drafts and approval history.
-- Its checksum ledger and archived source records remain intact for recovery.
DO $$
BEGIN
    IF to_regclass('public.legacy_message_creation_records') IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='legacy_message_creation_records' AND column_name='workflow_status') THEN
            ALTER TABLE legacy_message_creation_records
                ADD COLUMN command_id uuid,
                ADD COLUMN workflow_status text NOT NULL DEFAULT 'released',
                ADD COLUMN routing_revision integer NOT NULL DEFAULT 1,
                ADD COLUMN routing_route jsonb NOT NULL DEFAULT '[]',
                ADD COLUMN workflow_id text,
                ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
                ADD COLUMN released_at timestamptz,
                ADD COLUMN released_by uuid,
                ADD COLUMN release_sequence bigint;
            UPDATE legacy_message_creation_records m SET command_id=u.command_id,workflow_status='drafting',updated_at=m.created_at
                FROM users u WHERE m.created_by=u.id AND m.draft_id IS NOT NULL;
        END IF;
        INSERT INTO outgoing_messages (id,draft_id,created_by,command_id,request_id,request_hash,received_at,record,workflow_status,routing_revision,routing_route,workflow_id,created_at,updated_at,released_at,released_by,release_sequence)
        SELECT id,draft_id,created_by,command_id,request_id,request_hash,received_at,
            record || jsonb_build_object(
                'rawText',COALESCE(record->>'rawText',record->>'renderedText',(SELECT d.rendered_text FROM message_drafts d WHERE d.id=l.draft_id),''),
                'renderedText',COALESCE(record->>'renderedText',(SELECT d.rendered_text FROM message_drafts d WHERE d.id=l.draft_id),'')),
            workflow_status,routing_revision,routing_route,workflow_id,created_at,updated_at,released_at,released_by,release_sequence
        FROM legacy_message_creation_records l WHERE draft_id IS NOT NULL;
        IF to_regclass('public.message_routing_events') IS NOT NULL THEN
            INSERT INTO outgoing_message_events (id,message_id,actor_id,actor_name,event_type,step_title,comment,revision,snapshot_hash,at)
            SELECT e.id,e.message_id,e.actor_id,e.actor_name,e.event_type,e.step_title,e.comment,e.revision,e.snapshot_hash,e.at
            FROM message_routing_events e JOIN outgoing_messages m ON m.id=e.message_id ORDER BY e.sequence;
        END IF;
        -- Migrate exact stored text only. Never invent external artifacts from
        -- display sections; any records without text remain in the archive.
        INSERT INTO message_artifacts (c2oix_id,raw_text,sha256,size_bytes,ingested_by)
        SELECT CASE WHEN draft_id IS NULL THEN record->>'c2oixId' ELSE 'ANCHOR-'||id END,
            COALESCE(record->>'rawText',record->>'renderedText'),
            encode(sha256(convert_to(COALESCE(record->>'rawText',record->>'renderedText'),'UTF8')),'hex'),
            octet_length(COALESCE(record->>'rawText',record->>'renderedText')),created_by
        FROM legacy_message_creation_records WHERE workflow_status='released'
            AND btrim(COALESCE(record->>'rawText',record->>'renderedText',''))<>''
            AND (draft_id IS NOT NULL OR btrim(COALESCE(record->>'c2oixId',''))<>'') ON CONFLICT DO NOTHING;
        INSERT INTO messages (id,reference,c2oix_id,received,lifecycle,replaced_by,record)
        SELECT l.id,l.record->>'reference',a.c2oix_id,l.received_at,l.record->>'lifecycle',l.record->>'replacedBy',
            l.record - 'rawText' - 'sha256' - 'c2oixId' - 'lifecycle' - 'replacedBy'
        FROM legacy_message_creation_records l JOIN message_artifacts a
            ON a.c2oix_id=CASE WHEN l.draft_id IS NULL THEN l.record->>'c2oixId' ELSE 'ANCHOR-'||l.id END
        WHERE l.workflow_status='released' ON CONFLICT DO NOTHING;
    END IF;
END $$;
