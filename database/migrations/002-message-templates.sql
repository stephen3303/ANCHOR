-- Templates and forms use JSON Schema + separate UI metadata. JSONB shape checks
-- here are not a substitute for application-level schema/field validation.
CREATE TABLE reference_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL CHECK (btrim(key) <> ''),
    contract_version integer NOT NULL DEFAULT 1 CHECK (contract_version > 0),
    name text NOT NULL CHECK (btrim(name) <> ''),
    provider text NOT NULL CHECK (btrim(provider) <> ''),
    parameter_schema jsonb NOT NULL DEFAULT '{"type":"object","properties":{},"additionalProperties":false}'
        CHECK (jsonb_typeof(parameter_schema) = 'object'),
    enabled boolean NOT NULL DEFAULT true,
    last_successful_sync_at timestamptz,
    last_sync_status text CHECK (last_sync_status IN ('running', 'success', 'failed')),
    source_revision text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (key, contract_version)
);

-- The only currently implemented source is the local PLADS commands table.
-- Future provider adapters can add new source contracts without arbitrary URLs
-- or credentials in template definitions.
INSERT INTO reference_sources (key, name, provider)
VALUES ('recipient-commands', 'PLADS command directory', 'local-commands');

CREATE TABLE message_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL UNIQUE CHECK (btrim(key) <> ''),
    name text NOT NULL CHECK (btrim(name) <> ''),
    description text NOT NULL DEFAULT '',
    active boolean NOT NULL DEFAULT true,
    created_by text NOT NULL CHECK (btrim(created_by) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE message_template_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id uuid NOT NULL REFERENCES message_templates(id) ON DELETE RESTRICT,
    version integer NOT NULL CHECK (version > 0),
    input_schema jsonb NOT NULL DEFAULT '{"type":"object","properties":{}}'
        CHECK (jsonb_typeof(input_schema) = 'object'),
    ui_schema jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(ui_schema) = 'object'),
    output_definition jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(output_definition) = 'object'),
    formatting_profile jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(formatting_profile) = 'object'),
    renderer_version text NOT NULL DEFAULT '1' CHECK (btrim(renderer_version) <> ''),
    created_by text NOT NULL CHECK (btrim(created_by) <> ''),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    UNIQUE (template_id, version)
);

CREATE TABLE message_drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    template_version_id uuid NOT NULL REFERENCES message_template_versions(id) ON DELETE RESTRICT,
    created_by text NOT NULL CHECK (btrim(created_by) <> ''),
    -- Nullable metadata/output allows saving an incomplete form before rendering.
    subject text NOT NULL DEFAULT '',
    message_type text,
    originator text,
    precedence text CHECK (precedence IN ('FLASH', 'IMMEDIATE', 'PRIORITY', 'ROUTINE')),
    classification text CHECK (classification IN ('UNCLASSIFIED', 'CUI', 'CONFIDENTIAL', 'SECRET')),
    input_values jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(input_values) = 'object'),
    rendered_document jsonb CHECK (jsonb_typeof(rendered_document) = 'object'),
    rendered_text text,
    render_metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(render_metadata) = 'object'),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((rendered_document IS NULL) = (rendered_text IS NULL))
);

CREATE INDEX message_drafts_creator_updated_idx ON message_drafts (created_by, updated_at DESC);
CREATE INDEX message_drafts_template_version_idx ON message_drafts (template_version_id);

CREATE TABLE message_draft_references (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id uuid NOT NULL REFERENCES message_drafts(id) ON DELETE CASCADE,
    field_key text NOT NULL CHECK (btrim(field_key) <> ''),
    position integer NOT NULL CHECK (position >= 0),
    source_id uuid NOT NULL REFERENCES reference_sources(id) ON DELETE RESTRICT,
    -- A real FK for today's command directory; other providers can use their
    -- stable external record ID. Neither value is a user-entered routing address.
    command_id uuid REFERENCES commands(id) ON DELETE RESTRICT,
    external_record_id text CHECK (btrim(external_record_id) <> ''),
    snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
    resolved_parameters jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(resolved_parameters) = 'object'),
    resolved_at timestamptz NOT NULL DEFAULT now(),
    source_revision text,
    CHECK (num_nonnulls(command_id, external_record_id) = 1),
    UNIQUE (draft_id, field_key, position)
);

CREATE UNIQUE INDEX message_draft_references_command_unique
    ON message_draft_references (draft_id, field_key, command_id) WHERE command_id IS NOT NULL;
CREATE UNIQUE INDEX message_draft_references_external_unique
    ON message_draft_references (draft_id, field_key, source_id, external_record_id)
    WHERE external_record_id IS NOT NULL;
CREATE INDEX message_draft_references_source_idx ON message_draft_references (source_id);
CREATE INDEX message_draft_references_command_idx ON message_draft_references (command_id);

CREATE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE TRIGGER message_templates_updated BEFORE UPDATE ON message_templates
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER reference_sources_updated BEFORE UPDATE ON reference_sources
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE FUNCTION protect_reference_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.key, NEW.contract_version, NEW.provider, NEW.parameter_schema)
        IS DISTINCT FROM ROW(OLD.key, OLD.contract_version, OLD.provider, OLD.parameter_schema) THEN
        RAISE EXCEPTION 'Reference source contracts are immutable; create a new contract version';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER reference_sources_contract BEFORE UPDATE ON reference_sources
    FOR EACH ROW EXECUTE FUNCTION protect_reference_contract();

CREATE FUNCTION protect_template_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.published_at IS NOT NULL THEN
        RAISE EXCEPTION 'Published template versions are immutable; create a new version';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    IF ROW(NEW.id, NEW.template_id, NEW.version, NEW.created_by, NEW.created_at)
        IS DISTINCT FROM ROW(OLD.id, OLD.template_id, OLD.version, OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION 'Template version identity and creator cannot be changed';
    END IF;
    NEW.revision := OLD.revision + 1;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;
CREATE TRIGGER message_template_versions_protect BEFORE UPDATE OR DELETE ON message_template_versions
    FOR EACH ROW EXECUTE FUNCTION protect_template_version();

CREATE FUNCTION validate_message_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF ROW(NEW.id, NEW.template_version_id, NEW.created_by, NEW.created_at)
            IS DISTINCT FROM ROW(OLD.id, OLD.template_version_id, OLD.created_by, OLD.created_at) THEN
            RAISE EXCEPTION 'Draft identity, template version and creator cannot be changed';
        END IF;
        NEW.revision := OLD.revision + 1;
        NEW.updated_at := clock_timestamp();
    ELSE
        PERFORM id FROM message_template_versions
            WHERE id = NEW.template_version_id AND published_at IS NOT NULL FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Message drafts must reference a published template version';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER message_drafts_validate BEFORE INSERT OR UPDATE ON message_drafts
    FOR EACH ROW EXECUTE FUNCTION validate_message_draft();

COMMENT ON COLUMN message_template_versions.ui_schema IS
    'Controls, ordering and reference bindings: source key + contract version + declarative parameter bindings.';
COMMENT ON COLUMN message_drafts.created_by IS
    'Server-authenticated identity; no authentication/user directory or row-level authorization is implemented yet.';
COMMENT ON TABLE message_draft_references IS
    'Current draft selection snapshots. Replace transactionally with input/output updates; not a revision history.';
