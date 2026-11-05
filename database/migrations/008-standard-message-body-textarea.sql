-- Preserve existing published versions and every message's version pin.
-- Upgrade only the latest Standard Message definition whose Body is still a
-- textbox; preserve customizations to its text, other fields, and active flag.
DO $$
DECLARE parent record; previous message_template_versions%ROWTYPE; next_version integer; updated_ui jsonb;
BEGIN
    FOR parent IN SELECT id FROM message_templates
        WHERE key='standard-message' OR lower(name)=lower('Standard Message')
        ORDER BY id FOR UPDATE LOOP
        SELECT * INTO previous FROM message_template_versions
            WHERE template_id=parent.id AND published_at IS NOT NULL ORDER BY version DESC LIMIT 1;
        IF NOT FOUND THEN CONTINUE; END IF;
        IF jsonb_typeof(previous.ui_schema->'fields') IS DISTINCT FROM 'array' THEN CONTINUE; END IF;
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(previous.ui_schema->'fields') field
            WHERE field->>'name'='Body' AND field->>'control'='text') THEN CONTINUE; END IF;
        SELECT jsonb_set(previous.ui_schema,'{fields}',jsonb_agg(
            CASE WHEN field->>'name'='Body' AND field->>'control'='text'
                 THEN jsonb_set(field,'{control}','"textarea"') ELSE field END ORDER BY position))
            INTO updated_ui FROM jsonb_array_elements(previous.ui_schema->'fields') WITH ORDINALITY AS fields(field,position);
        SELECT coalesce(max(version),0)+1 INTO next_version FROM message_template_versions WHERE template_id=parent.id;
        INSERT INTO message_template_versions
            (template_id,version,input_schema,ui_schema,output_definition,formatting_profile,renderer_version,created_by,published_at)
        VALUES (parent.id,next_version,previous.input_schema,updated_ui,previous.output_definition,
            previous.formatting_profile,previous.renderer_version,previous.created_by,now());
    END LOOP;
END $$;
