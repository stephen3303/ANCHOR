-- Add a References input (REF / AMPN / NARR, NTP 3(J) para 711) to the
-- Standard Message as a new published version. Earlier versions and every
-- draft's version pin are unchanged. The {{ References }} line goes right after
-- the SUBJ line; a message with no references renders no line at all.
-- Skips a template that already has a References input, has no SUBJ line, or
-- already uses the name References for something else.
DO $$
DECLARE parent record; previous message_template_versions%ROWTYPE; next_version integer;
    body text; subject_line text; updated_ui jsonb; updated_input jsonb;
    reference_field jsonb := '{"name":"References","control":"reference-list","required":false,"options":[],"reference":{"source":"local-messages","contractVersion":1,"parameters":{}}}';
BEGIN
    FOR parent IN SELECT id FROM message_templates
        WHERE key='standard-message' OR lower(name)=lower('Standard Message')
        ORDER BY id FOR UPDATE LOOP
        SELECT * INTO previous FROM message_template_versions
            WHERE template_id=parent.id AND published_at IS NOT NULL ORDER BY version DESC LIMIT 1;
        IF NOT FOUND THEN CONTINUE; END IF;
        IF jsonb_typeof(previous.ui_schema->'fields') IS DISTINCT FROM 'array' THEN CONTINUE; END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(previous.ui_schema->'fields') field
            WHERE field->>'control'='reference-list' OR field->>'name'='References') THEN CONTINUE; END IF;
        body := previous.output_definition->>'body';
        IF body IS NULL OR body ~ '\{\{\s*References\s*\}\}' THEN CONTINUE; END IF;
        subject_line := substring(body FROM '(?n)^SUBJ/[^\n]*\{\{\s*Subject\s*\}\}[^\n]*');
        IF subject_line IS NULL THEN CONTINUE; END IF;
        -- After the Subject field, so the form lists References where the line sits.
        SELECT jsonb_set(previous.ui_schema,'{fields}',jsonb_agg(item ORDER BY position, sub))
            INTO updated_ui FROM (
                SELECT field AS item, position, 0 AS sub FROM jsonb_array_elements(previous.ui_schema->'fields') WITH ORDINALITY AS fields(field,position)
                UNION ALL
                SELECT reference_field, coalesce((SELECT position FROM jsonb_array_elements(previous.ui_schema->'fields') WITH ORDINALITY AS f(field,position) WHERE field->>'name'='Subject' LIMIT 1), 1000), 1
            ) items;
        updated_input := jsonb_set(previous.input_schema,'{properties,References}','{"type":"string","maxLength":100000,"contentMediaType":"application/json"}');
        SELECT coalesce(max(version),0)+1 INTO next_version FROM message_template_versions WHERE template_id=parent.id;
        INSERT INTO message_template_versions
            (template_id,version,input_schema,ui_schema,output_definition,formatting_profile,renderer_version,created_by,published_at)
        VALUES (parent.id,next_version,updated_input,updated_ui,
            jsonb_set(previous.output_definition,'{body}',to_jsonb(overlay(body PLACING subject_line || E'\n{{ References }}' FROM position(subject_line IN body) FOR length(subject_line)))),
            previous.formatting_profile,previous.renderer_version,previous.created_by,now());
    END LOOP;
END $$;
