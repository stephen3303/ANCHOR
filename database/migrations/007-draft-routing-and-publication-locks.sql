ALTER TABLE outgoing_messages ADD COLUMN route_custom boolean NOT NULL DEFAULT false;
-- New history entries retain the chain at the time of the action. Older
-- entries have no reconstructable route snapshot and keep the empty default.
ALTER TABLE outgoing_message_events ADD COLUMN route_snapshot jsonb NOT NULL DEFAULT '[]'
    CHECK (jsonb_typeof(route_snapshot)='array');

CREATE FUNCTION protect_published_outgoing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.workflow_status='released' THEN
        RAISE EXCEPTION 'Published outgoing messages are immutable';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER outgoing_publication_lock BEFORE UPDATE OR DELETE ON outgoing_messages
    FOR EACH ROW EXECUTE FUNCTION protect_published_outgoing();

CREATE FUNCTION protect_local_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.record->>'kind'='released' THEN
        RAISE EXCEPTION 'Published local messages are immutable';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER messages_publication_lock BEFORE UPDATE OR DELETE ON messages
    FOR EACH ROW EXECUTE FUNCTION protect_local_publication();

CREATE FUNCTION protect_published_template_inputs() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE phase text; old_draft uuid; new_draft uuid;
BEGIN
    IF TG_TABLE_NAME='message_drafts' THEN
        old_draft := OLD.id;
    ELSE
        IF TG_OP<>'INSERT' THEN old_draft := OLD.draft_id; END IF;
        IF TG_OP<>'DELETE' THEN new_draft := NEW.draft_id; END IF;
    END IF;
    -- Serialize with publication; recheck after a concurrent release commits.
    FOR phase IN SELECT workflow_status FROM outgoing_messages
        WHERE draft_id=old_draft OR draft_id=new_draft ORDER BY id FOR SHARE LOOP
        IF phase='released' THEN RAISE EXCEPTION 'Published message inputs and references are immutable'; END IF;
    END LOOP;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER message_drafts_publication_lock BEFORE UPDATE OR DELETE ON message_drafts
    FOR EACH ROW EXECUTE FUNCTION protect_published_template_inputs();
CREATE TRIGGER message_references_publication_lock BEFORE INSERT OR UPDATE OR DELETE ON message_draft_references
    FOR EACH ROW EXECUTE FUNCTION protect_published_template_inputs();

CREATE TRIGGER outgoing_messages_no_truncate BEFORE TRUNCATE ON outgoing_messages
    FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TRIGGER messages_no_truncate BEFORE TRUNCATE ON messages
    FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TRIGGER message_drafts_no_truncate BEFORE TRUNCATE ON message_drafts
    FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TRIGGER message_references_no_truncate BEFORE TRUNCATE ON message_draft_references
    FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
