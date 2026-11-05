-- Command role model (2026-11-05) and the transmission queue.
--
-- Roles: Message Viewer (everyone), Subscription Approver, Report Viewer,
-- Auditor, Message Admin, Designated Release Authority, Release Authority
-- (one per command, the commanding officer) and System Admin.
-- Briefing Creator and Subscription Requester fold into Message Viewer.

DO $roles$
DECLARE
  catalog jsonb := '[
    {"name":"Message Viewer","detail":"View messages, request subscriptions and build briefings"},
    {"name":"Subscription Approver","detail":"Assign feeds to users and review subscription requests"},
    {"name":"Report Viewer","detail":"View the Reports page"},
    {"name":"Auditor","detail":"View audit logs and integrity checks"},
    {"name":"Message Admin","detail":"Transmit released traffic, manage comm links, send acknowledgements"},
    {"name":"Designated Release Authority","detail":"Release outgoing traffic for designated message types"},
    {"name":"Release Authority","detail":"Commanding officer: release any traffic and designate release authorities"},
    {"name":"System Admin","detail":"Manage users, roles and command settings"}
  ]';
  u record;
  held text[];
  granted text[];
  co uuid;
BEGIN
  FOR u IN SELECT id, login, command_id, profile FROM users LOOP
    held := ARRAY(SELECT r->>'name' FROM jsonb_array_elements(
      CASE jsonb_typeof(u.profile->'roles') WHEN 'array' THEN u.profile->'roles' ELSE '[]'::jsonb END) r
      WHERE (r->>'granted')::boolean);
    granted := ARRAY['Message Viewer'];
    IF 'Subscription Approver' = ANY(held) THEN granted := array_append(granted, 'Subscription Approver'); END IF;
    IF 'Report Viewer' = ANY(held) THEN granted := array_append(granted, 'Report Viewer'); END IF;
    -- Audit logs were open to everyone; keep them with the people who administer the system.
    IF 'System Admin' = ANY(held) THEN granted := granted || ARRAY['Auditor', 'System Admin']; END IF;
    -- The commander's designation becomes the command's single Release Authority.
    SELECT (a->>'personId')::uuid INTO co FROM command_routing cr, jsonb_array_elements(cr.authorities) a
      WHERE cr.command_id = u.command_id AND (a->>'isCommandingOfficer')::boolean
        AND a->>'personId' ~ '^[0-9a-f-]{36}$' LIMIT 1;
    IF co = u.id AND 'Designated Release Authority' = ANY(held) THEN
      granted := array_append(granted, 'Release Authority');
    ELSIF 'Designated Release Authority' = ANY(held) THEN
      granted := array_append(granted, 'Designated Release Authority');
    END IF;
    -- Demo roster: the N6 Information Systems Security Manager is the command's Message Admin.
    IF u.login = 'DHarper' THEN granted := array_append(granted, 'Message Admin'); END IF;
    UPDATE users SET profile = jsonb_set(profile, '{roles}', (
      SELECT jsonb_agg(c || jsonb_build_object('granted', (c->>'name') = ANY(granted)) ORDER BY o)
      FROM jsonb_array_elements(catalog) WITH ORDINALITY AS t(c, o)))
    WHERE id = u.id;
  END LOOP;
  -- Designations now list only designated release authorities; the Release Authority needs none.
  UPDATE command_routing SET authorities = coalesce((
      SELECT jsonb_agg(a) FROM jsonb_array_elements(authorities) a
      WHERE NOT coalesce((a->>'isCommandingOfficer')::boolean, false)), '[]'::jsonb),
    revision = revision + 1
  WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(authorities) a WHERE (a->>'isCommandingOfficer')::boolean);
END $roles$;

-- Released traffic waits here until the Message Admin transmits it. A release
-- can be revoked only while queued. Acknowledgements the Message Admin sends are
-- recorded as transmitted at once.
CREATE TABLE transmissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    command_id uuid NOT NULL REFERENCES commands(id) ON DELETE RESTRICT,
    kind text NOT NULL CHECK (kind IN ('release', 'acknowledgement')),
    outgoing_message_id text REFERENCES outgoing_messages(id) ON DELETE RESTRICT,
    acknowledged_message_id text REFERENCES messages(id) ON DELETE RESTRICT,
    reference text NOT NULL CHECK (btrim(reference) <> ''),
    subject text NOT NULL,
    precedence text NOT NULL,
    body text NOT NULL,
    status text NOT NULL CHECK (status IN ('queued', 'transmitted', 'cancelled')),
    queued_at timestamptz NOT NULL DEFAULT now(),
    queued_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    closed_at timestamptz,
    closed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
    note text NOT NULL DEFAULT '',
    CHECK ((kind = 'release') = (outgoing_message_id IS NOT NULL)),
    CHECK ((kind = 'acknowledgement') = (acknowledged_message_id IS NOT NULL)),
    CHECK (kind = 'release' OR status = 'transmitted'),
    CHECK ((status = 'queued') = (closed_at IS NULL AND closed_by IS NULL))
);
CREATE INDEX transmissions_command_idx ON transmissions (command_id, status, queued_at);
CREATE UNIQUE INDEX transmissions_one_open_release ON transmissions (outgoing_message_id) WHERE status = 'queued';
CREATE TRIGGER transmissions_no_delete BEFORE DELETE ON transmissions
    FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER transmissions_no_truncate BEFORE TRUNCATE ON transmissions
    FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();

DO $events$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
    WHERE conrelid = 'outgoing_message_events'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%event_type%';
  EXECUTE format('ALTER TABLE outgoing_message_events DROP CONSTRAINT %I', c);
END $events$;
ALTER TABLE outgoing_message_events ADD CONSTRAINT outgoing_message_events_event_type_check
    CHECK (event_type IN ('created','submitted','advanced','returned','revised','released','withdrawn','release_revoked','transmitted'));

-- Released messages stay final, with two exceptions the transmission queue
-- needs: the Message Admin's transmission stamp, added once without touching
-- the approved text or release, and the releaser's or Release Authority's
-- withdrawal of a release that is still queued.
CREATE OR REPLACE FUNCTION protect_published_outgoing() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    stamp text[] := ARRAY['transmittedAt', 'transmittedBy', 'c2oixId', 'sha256', 'sizeKb'];
    bookkeeping text[] := ARRAY['record', 'routing_revision', 'updated_at'];
BEGIN
    IF OLD.workflow_status = 'released' THEN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Published outgoing messages are immutable'; END IF;
        IF NEW.workflow_status = 'released' AND NOT OLD.record ? 'transmittedAt' AND NEW.record ? 'transmittedAt'
            AND (NEW.record - stamp) = (OLD.record - stamp)
            AND (to_jsonb(NEW) - bookkeeping) = (to_jsonb(OLD) - bookkeeping) THEN
            RETURN NEW;
        END IF;
        IF NEW.workflow_status = 'returned' AND NOT OLD.record ? 'transmittedAt'
            AND NEW.record->>'rawText' IS NOT DISTINCT FROM OLD.record->>'rawText'
            AND EXISTS (SELECT 1 FROM transmissions WHERE outgoing_message_id = OLD.id AND status = 'queued') THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Published outgoing messages are immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
