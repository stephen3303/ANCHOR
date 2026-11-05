-- A Type may carry a subtag after a colon (MSGID/SAFETY:ELECTRICAL/...).
-- Subscribing to the type alone (SAFETY) catches every subtag, so whenever a
-- TYPE:SUBTAG topic is registered (template publish or message publication),
-- register its parent type too. Topics stay append-only; never reset IDs.
CREATE FUNCTION register_parent_message_topic() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent text := btrim(split_part(NEW.name, ':', 1));
BEGIN
    IF position(':' IN NEW.name) > 1 AND parent <> '' THEN
        INSERT INTO message_topics(name) VALUES (parent) ON CONFLICT (name) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER message_topics_register_parent AFTER INSERT ON message_topics
    FOR EACH ROW EXECUTE FUNCTION register_parent_message_topic();

INSERT INTO message_topics(name)
SELECT DISTINCT btrim(split_part(name, ':', 1)) FROM message_topics
WHERE position(':' IN name) > 1 AND btrim(split_part(name, ':', 1)) <> ''
ON CONFLICT (name) DO NOTHING;
