-- Advertise fixed Type topics when templates are published, before any message
-- is sent. Migration 009's message-publication trigger remains the second path.
-- Both use the same unique name and ON CONFLICT DO NOTHING: never reset personal
-- memberships, existing topic IDs or publication counts.
CREATE FUNCTION template_message_topic(definition jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE topic text;
BEGIN
    SELECT btrim(field->>'fixedValue') INTO topic
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(definition->'fields') = 'array'
        THEN definition->'fields' ELSE '[]'::jsonb END) field
    WHERE field->>'name' IN ('Type', 'Msg Type') AND jsonb_typeof(field->'fixedValue') = 'string'
    ORDER BY CASE WHEN field->>'name' = 'Type' THEN 0 ELSE 1 END LIMIT 1;
    IF topic IS NULL OR length(topic) NOT BETWEEN 1 AND 200 OR topic ~ E'[\\n\\r]' THEN RETURN NULL; END IF;
    RETURN topic;
END;
$$;

CREATE FUNCTION register_template_message_topic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE topic text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM message_templates WHERE id=NEW.template_id AND active) THEN RETURN NEW; END IF;
    topic := template_message_topic(NEW.ui_schema);
    -- Legacy templates without an author-fixed Type must not invent a topic.
    IF topic IS NOT NULL THEN
        INSERT INTO message_topics(name) VALUES (topic) ON CONFLICT (name) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER template_versions_register_topic AFTER INSERT OR UPDATE OF published_at ON message_template_versions
    FOR EACH ROW WHEN (NEW.published_at IS NOT NULL) EXECUTE FUNCTION register_template_message_topic();

-- Backfill the current published version of active templates only. Previously
-- advertised topics and published-message mappings are never removed/rewritten.
INSERT INTO message_topics(name)
SELECT DISTINCT template_message_topic(v.ui_schema)
FROM message_templates t
JOIN LATERAL (
    SELECT ui_schema FROM message_template_versions WHERE template_id=t.id AND published_at IS NOT NULL
    ORDER BY version DESC LIMIT 1
) v ON true
WHERE t.active AND template_message_topic(v.ui_schema) IS NOT NULL
ON CONFLICT (name) DO NOTHING;
