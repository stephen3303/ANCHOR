-- Personal pub/sub preferences are separate from workflow/release categories.
-- Register a topic only when its first message enters the published store.
CREATE TABLE message_topics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 200 AND name !~ E'[\\n\\r]'),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER message_topics_append_only BEFORE UPDATE OR DELETE ON message_topics
    FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER message_topics_no_truncate BEFORE TRUNCATE ON message_topics
    FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TABLE message_topic_messages (
    message_id text PRIMARY KEY REFERENCES messages(id) ON DELETE RESTRICT,
    topic_id uuid NOT NULL REFERENCES message_topics(id) ON DELETE RESTRICT
);
CREATE INDEX message_topic_messages_topic_idx ON message_topic_messages(topic_id);
CREATE TRIGGER message_topic_messages_append_only BEFORE UPDATE OR DELETE ON message_topic_messages
    FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER message_topic_messages_no_truncate BEFORE TRUNCATE ON message_topic_messages
    FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TABLE message_topic_subscriptions (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id uuid NOT NULL REFERENCES message_topics(id) ON DELETE RESTRICT,
    subscribed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, topic_id)
);

-- Local traffic uses its immutable pinned definition, not rendered (possibly
-- wrapped) text or the mutable template parent. Legacy manual Type values and
-- received MSGID traffic are supported without rewriting any canonical record.
CREATE FUNCTION published_message_topic(message_id text, raw_text text) RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE topic text;
BEGIN
    SELECT coalesce(
        (SELECT f->>'fixedValue' FROM jsonb_array_elements(v.ui_schema->'fields') f
         WHERE f->>'name' IN ('Type', 'Msg Type') AND nullif(btrim(f->>'fixedValue'), '') IS NOT NULL LIMIT 1),
        CASE WHEN jsonb_typeof(d.input_values->'Type') = 'string' THEN d.input_values->>'Type' END,
        CASE WHEN jsonb_typeof(d.input_values->'Msg Type') = 'string' THEN d.input_values->>'Msg Type' END)
    INTO topic FROM message_drafts d JOIN message_template_versions v ON v.id = d.template_version_id
    WHERE d.id::text = message_id;
    IF nullif(btrim(topic), '') IS NULL THEN
        topic := substring(raw_text FROM '(?m)^MSGID/([^/\r\n]+)');
    END IF;
    topic := btrim(topic);
    IF topic IS NULL OR length(topic) NOT BETWEEN 1 AND 200 OR topic ~ E'[\\n\\r]' THEN RETURN NULL; END IF;
    RETURN topic;
END;
$$;

CREATE FUNCTION register_published_message_topic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE topic text; topic_id uuid;
BEGIN
    SELECT published_message_topic(NEW.id, a.raw_text) INTO topic FROM message_artifacts a WHERE a.c2oix_id = NEW.c2oix_id;
    IF topic IS NOT NULL THEN
        INSERT INTO message_topics(name) VALUES (topic) ON CONFLICT (name) DO NOTHING;
        SELECT id INTO topic_id FROM message_topics WHERE name = topic;
        INSERT INTO message_topic_messages(message_id, topic_id) VALUES (NEW.id, topic_id);
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER messages_register_topic AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION register_published_message_topic();

-- Backfill derived metadata only. Existing messages/artifacts remain immutable.
INSERT INTO message_topics(name)
SELECT DISTINCT published_message_topic(m.id, a.raw_text)
FROM messages m JOIN message_artifacts a ON a.c2oix_id = m.c2oix_id
WHERE published_message_topic(m.id, a.raw_text) IS NOT NULL
ON CONFLICT (name) DO NOTHING;
INSERT INTO message_topic_messages(message_id, topic_id)
SELECT m.id, t.id FROM messages m JOIN message_artifacts a ON a.c2oix_id = m.c2oix_id
JOIN message_topics t ON t.name = published_message_topic(m.id, a.raw_text);
