-- Server-side message store fed by C2OIX ingestion.
--
-- The raw text in message_artifacts is the official record: hashed at
-- ingestion and never changed. Acknowledgements are recorded per command, not
-- per person, and are append-only like the artifacts.

CREATE FUNCTION refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; % refused', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE TABLE message_artifacts (
    c2oix_id text PRIMARY KEY CHECK (btrim(c2oix_id) <> ''),
    raw_text text NOT NULL CHECK (btrim(raw_text) <> ''),
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    size_bytes integer NOT NULL CHECK (size_bytes > 0),
    ingested_at timestamptz NOT NULL DEFAULT now(),
    ingested_by uuid REFERENCES users(id) ON DELETE RESTRICT
);
CREATE TRIGGER message_artifacts_append_only BEFORE UPDATE OR DELETE ON message_artifacts
    FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER message_artifacts_no_truncate BEFORE TRUNCATE ON message_artifacts
    FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();

-- Serials for traffic ingested live; the demo seed uses its own fixed ids below this range.
CREATE SEQUENCE message_artifact_serial START 60000;

CREATE TABLE messages (
    id text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
    reference text NOT NULL UNIQUE CHECK (btrim(reference) <> ''),
    c2oix_id text NOT NULL UNIQUE REFERENCES message_artifacts(c2oix_id) ON DELETE RESTRICT,
    received timestamptz NOT NULL,
    lifecycle text NOT NULL CHECK (lifecycle IN ('ACTIVE', 'AMENDED', 'CORRECTED', 'CANCELLED', 'SUPERSEDED', 'EXPIRED')),
    replaced_by text,
    -- The display record (sections, communities, summary). Official fields are
    -- also in the artifact; integrity checks compare against the artifact.
    record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_received_idx ON messages (received DESC);
CREATE TRIGGER messages_updated BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE FUNCTION protect_message_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.id, NEW.reference, NEW.c2oix_id, NEW.received)
        IS DISTINCT FROM ROW(OLD.id, OLD.reference, OLD.c2oix_id, OLD.received) THEN
        RAISE EXCEPTION 'A message''s serial, artifact and receipt time cannot change';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER messages_identity BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION protect_message_identity();

-- One row per acknowledgement by a command. 'local' rows are this command
-- acknowledging traffic it received, with the user who did it; 'received' rows
-- are other commands acknowledging traffic this command sent. A command can
-- acknowledge more than once, for example again after an amendment.
CREATE TABLE message_acknowledgements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id text NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
    origin text NOT NULL CHECK (origin IN ('local', 'received')),
    command_name text NOT NULL CHECK (btrim(command_name) <> ''),
    command_id uuid REFERENCES commands(id) ON DELETE RESTRICT,
    acknowledged_by uuid REFERENCES users(id) ON DELETE RESTRICT,
    acknowledged_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    CHECK (origin = 'received' OR (command_id IS NOT NULL AND acknowledged_by IS NOT NULL))
);
CREATE INDEX message_acknowledgements_message_idx ON message_acknowledgements (message_id, acknowledged_at);
CREATE INDEX message_acknowledgements_command_idx ON message_acknowledgements (command_id) WHERE command_id IS NOT NULL;
CREATE UNIQUE INDEX message_acknowledgements_received_unique
    ON message_acknowledgements (message_id, command_name, acknowledged_at) WHERE origin = 'received';
CREATE TRIGGER message_acknowledgements_append_only BEFORE UPDATE OR DELETE ON message_acknowledgements
    FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER message_acknowledgements_no_truncate BEFORE TRUNCATE ON message_acknowledgements
    FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();

-- Per-person read state. Acknowledgement is deliberately not here.
CREATE TABLE message_user_state (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    read_state text NOT NULL CHECK (read_state IN ('new', 'unread', 'read')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, message_id)
);
CREATE TRIGGER message_user_state_updated BEFORE UPDATE ON message_user_state
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMENT ON TABLE message_artifacts IS
    'Raw C2OIX text as received. Append-only; SHA-256 recorded at ingestion and recomputed by the integrity check.';
COMMENT ON TABLE message_acknowledgements IS
    'Command-level acknowledgements. Append-only; the latest local row for a command is its acknowledgement.';
