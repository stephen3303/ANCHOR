\set ON_ERROR_STOP on
BEGIN;

-- All fixtures and mutations are rolled back, including changes to commands.
CREATE FUNCTION pg_temp.expect_error(statement text, fragment text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE failed boolean := false;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        IF position(fragment IN SQLERRM) = 0 THEN
            RAISE EXCEPTION 'Unexpected error: %', SQLERRM;
        END IF;
        failed := true;
    END;
    IF NOT failed THEN
        RAISE EXCEPTION 'Expected rejection: %', statement;
    END IF;
END;
$$;

DO $$
DECLARE
    template uuid;
    version_id uuid;
    draft uuid;
    source uuid;
    command uuid;
    current_revision integer;
BEGIN
    INSERT INTO message_templates (key, name, created_by)
        VALUES ('schema-test-' || gen_random_uuid(), 'Test template', 'schema-test') RETURNING id INTO template;
    INSERT INTO message_template_versions (template_id, version, created_by)
        VALUES (template, 1, 'schema-test') RETURNING id INTO version_id;

    PERFORM pg_temp.expect_error(format(
        'INSERT INTO message_template_versions (template_id, version, created_by) VALUES (%L, 1, ''test'')', template),
        'duplicate key');
    PERFORM pg_temp.expect_error(format(
        'UPDATE message_template_versions SET input_schema = ''[]'' WHERE id = %L', version_id),
        'check constraint');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO message_drafts (template_version_id, created_by) VALUES (%L, ''test'')', version_id),
        'published template version');

    UPDATE message_template_versions SET ui_schema = '{"fields":[]}' WHERE id = version_id;
    SELECT revision INTO current_revision FROM message_template_versions WHERE id = version_id;
    IF current_revision <> 2 THEN RAISE EXCEPTION 'Template revision did not increment'; END IF;
    UPDATE message_template_versions SET published_at = now() WHERE id = version_id;
    PERFORM pg_temp.expect_error(format(
        'UPDATE message_template_versions SET ui_schema = ''{}'' WHERE id = %L', version_id), 'immutable');
    PERFORM pg_temp.expect_error(format(
        'DELETE FROM message_template_versions WHERE id = %L', version_id), 'immutable');

    INSERT INTO message_drafts (template_version_id, created_by)
        VALUES (version_id, 'schema-test') RETURNING id INTO draft;
    UPDATE message_drafts SET input_values = '{"subject":"Test"}', subject = 'Test',
        rendered_document = '{"sections":[]}', rendered_text = 'Test' WHERE id = draft;
    SELECT revision INTO current_revision FROM message_drafts WHERE id = draft;
    IF current_revision <> 2 THEN RAISE EXCEPTION 'Draft revision did not increment'; END IF;
    PERFORM pg_temp.expect_error(format(
        'UPDATE message_drafts SET precedence = ''INVALID'' WHERE id = %L', draft), 'check constraint');
    PERFORM pg_temp.expect_error(format(
        'UPDATE message_drafts SET created_by = ''other'' WHERE id = %L', draft), 'cannot be changed');

    SELECT id INTO source FROM reference_sources WHERE key = 'recipient-commands' AND contract_version = 1;
    INSERT INTO commands (name) VALUES ('schema-test-' || gen_random_uuid()) RETURNING id INTO command;
    INSERT INTO message_draft_references (draft_id, field_key, position, source_id, command_id, snapshot)
        VALUES (draft, 'toCommands', 0, source, command, '{"name":"Original name"}');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO message_draft_references (draft_id, field_key, position, source_id, command_id, snapshot)
         VALUES (%L, ''toCommands'', 1, %L, %L, ''{}'')', draft, source, command), 'duplicate key');
    PERFORM pg_temp.expect_error(format('DELETE FROM commands WHERE id = %L', command), 'foreign key');
    PERFORM pg_temp.expect_error(format(
        'UPDATE reference_sources SET parameter_schema = ''{"type":"string"}'' WHERE id = %L', source), 'immutable');
    UPDATE commands SET name = name || '-updated' WHERE id = command;
    IF (SELECT snapshot->>'name' FROM message_draft_references WHERE draft_id = draft) <> 'Original name' THEN
        RAISE EXCEPTION 'Directory changes modified a saved snapshot';
    END IF;
    DELETE FROM message_drafts WHERE id = draft;
    IF EXISTS (SELECT 1 FROM message_draft_references WHERE draft_id = draft) THEN
        RAISE EXCEPTION 'Draft reference cleanup failed';
    END IF;
END;
$$;
ROLLBACK;
\echo Message template schema tests passed (all fixtures rolled back).
