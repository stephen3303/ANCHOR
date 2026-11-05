CREATE TABLE watch_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id uuid NOT NULL REFERENCES commands(id),
  station_id uuid,
  creator_id uuid NOT NULL REFERENCES users(id),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid NOT NULL REFERENCES users(id), updated_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (station_id,command_id) REFERENCES watch_stations(id,command_id)
);
CREATE INDEX watch_actions_scope ON watch_actions(command_id,station_id,creator_id);
CREATE TABLE watch_action_events (
  action_id uuid NOT NULL REFERENCES watch_actions(id), revision integer NOT NULL,
  actor_id uuid NOT NULL REFERENCES users(id), actor_name text NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp(), snapshot jsonb NOT NULL,
  PRIMARY KEY(action_id,revision)
);
CREATE FUNCTION protect_watch_action() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN RAISE EXCEPTION 'Watch actions cannot be deleted or truncated'; END IF;
  IF (NEW.id,NEW.command_id,NEW.station_id,NEW.creator_id,NEW.created_at) IS DISTINCT FROM
     (OLD.id,OLD.command_id,OLD.station_id,OLD.creator_id,OLD.created_at)
     OR NEW.revision <> OLD.revision+1 THEN RAISE EXCEPTION 'Watch action identity is immutable and revision must advance'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER watch_actions_guard BEFORE UPDATE OR DELETE ON watch_actions FOR EACH ROW EXECUTE FUNCTION protect_watch_action();
CREATE TRIGGER watch_actions_no_truncate BEFORE TRUNCATE ON watch_actions FOR EACH STATEMENT EXECUTE FUNCTION protect_watch_action();
CREATE TRIGGER watch_action_events_immutable BEFORE UPDATE OR DELETE ON watch_action_events FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER watch_action_events_no_truncate BEFORE TRUNCATE ON watch_action_events FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
