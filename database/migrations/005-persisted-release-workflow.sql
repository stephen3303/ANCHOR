CREATE TABLE command_routing (
    command_id uuid PRIMARY KEY REFERENCES commands(id) ON DELETE RESTRICT,
    workflows jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(workflows) = 'array'),
    authorities jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(authorities) = 'array'),
    settings jsonb NOT NULL DEFAULT '{"textCase":"mixed","sequencePrefix":"#","sequenceDigits":4,"nextSequence":1}' CHECK (jsonb_typeof(settings) = 'object'),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages
    ADD COLUMN command_id uuid REFERENCES commands(id) ON DELETE RESTRICT,
    ADD COLUMN workflow_status text NOT NULL DEFAULT 'released' CHECK (workflow_status IN ('drafting', 'in_routing', 'returned', 'released', 'withdrawn')),
    ADD COLUMN routing_revision integer NOT NULL DEFAULT 1 CHECK (routing_revision > 0),
    ADD COLUMN routing_route jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(routing_route) = 'array'),
    ADD COLUMN workflow_id text,
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN released_at timestamptz,
    ADD COLUMN released_by uuid REFERENCES users(id) ON DELETE RESTRICT,
    ADD COLUMN release_sequence bigint;

-- Preserve existing API drafts, but remove them from the published feed.
UPDATE messages m SET command_id = u.command_id, workflow_status = 'drafting',
    updated_at = m.created_at,
    record = jsonb_set(jsonb_set(record, '{dtg}', '""'), '{rawText}', COALESCE(record->'rawText', record->'renderedText', '""'::jsonb))
FROM users u WHERE m.created_by = u.id AND m.draft_id IS NOT NULL;

ALTER TABLE messages DROP CONSTRAINT messages_check1;
ALTER TABLE messages ADD CONSTRAINT messages_provenance CHECK (
    (draft_id IS NULL AND created_by IS NULL AND request_id IS NULL AND request_hash IS NULL AND workflow_status = 'released')
    OR (draft_id IS NOT NULL AND created_by IS NOT NULL AND command_id IS NOT NULL AND request_id IS NOT NULL
        AND request_hash IS NOT NULL AND request_hash ~ '^[0-9a-f]{64}$'
        AND record->>'kind' IS NOT NULL
        AND ((workflow_status = 'released' AND record->>'kind' = 'released' AND released_at IS NOT NULL AND released_by IS NOT NULL AND release_sequence IS NOT NULL)
             OR (workflow_status <> 'released' AND record->>'kind' = 'draft' AND released_at IS NULL AND released_by IS NULL AND release_sequence IS NULL))));
CREATE UNIQUE INDEX messages_release_sequence_unique ON messages (command_id, release_sequence) WHERE release_sequence IS NOT NULL;
CREATE INDEX messages_workflow_idx ON messages (command_id, workflow_status);

CREATE TABLE message_routing_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    message_id text NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
    actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    actor_name text NOT NULL,
    event_type text NOT NULL CHECK (event_type IN ('created','submitted','advanced','returned','revised','released','withdrawn')),
    step_title text,
    comment text NOT NULL DEFAULT '',
    revision integer NOT NULL,
    snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
    at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_routing_events_message_idx ON message_routing_events (message_id, sequence);
CREATE FUNCTION protect_message_routing_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Routing history is append-only';
END;
$$;
CREATE TRIGGER message_routing_events_immutable BEFORE UPDATE OR DELETE ON message_routing_events
    FOR EACH ROW EXECUTE FUNCTION protect_message_routing_events();
