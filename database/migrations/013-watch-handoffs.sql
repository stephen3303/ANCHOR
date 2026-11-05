CREATE TABLE watch_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id uuid NOT NULL REFERENCES commands(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  team text NOT NULL CHECK (btrim(team) <> ''),
  active boolean NOT NULL DEFAULT true,
  command_visible boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, command_id)
);
CREATE UNIQUE INDEX watch_station_names ON watch_stations(command_id, lower(name), lower(team));
CREATE TABLE watch_station_officers (
  station_id uuid NOT NULL REFERENCES watch_stations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  PRIMARY KEY (station_id, user_id)
);
CREATE TABLE watch_station_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), station_id uuid NOT NULL REFERENCES watch_stations(id),
  actor_id uuid NOT NULL REFERENCES users(id), actor_name text NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp(), snapshot jsonb NOT NULL
);
CREATE TABLE watch_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL,
  command_id uuid NOT NULL,
  station_name text NOT NULL, team text NOT NULL,
  outgoing_id uuid NOT NULL REFERENCES users(id), outgoing_name text NOT NULL,
  incoming_id uuid NOT NULL REFERENCES users(id), incoming_name text NOT NULL,
  watch_start timestamptz NOT NULL, watch_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Ready for review','Accepted')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  previous_id uuid REFERENCES watch_handoffs(id) ON DELETE RESTRICT,
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  accepted_at timestamptz, accepted_by uuid REFERENCES users(id), acceptance_exceptions text,
  FOREIGN KEY (station_id, command_id) REFERENCES watch_stations(id, command_id) ON DELETE RESTRICT,
  CHECK (outgoing_id <> incoming_id), CHECK (watch_end > watch_start),
  CHECK ((status = 'Accepted' AND accepted_at IS NOT NULL AND accepted_by = incoming_id)
    OR (status <> 'Accepted' AND accepted_at IS NULL AND accepted_by IS NULL AND acceptance_exceptions IS NULL))
);
CREATE UNIQUE INDEX watch_one_open_handoff ON watch_handoffs(station_id) WHERE status <> 'Accepted';
CREATE INDEX watch_handoff_history ON watch_handoffs(station_id, created_at DESC);
CREATE TABLE watch_handoff_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), handoff_id uuid NOT NULL REFERENCES watch_handoffs(id),
  kind text NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), actor_name text NOT NULL,
  at timestamptz NOT NULL DEFAULT clock_timestamp(), revision integer NOT NULL, snapshot jsonb NOT NULL,
  UNIQUE (handoff_id, revision)
);
CREATE TABLE watch_handoff_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), handoff_id uuid NOT NULL REFERENCES watch_handoffs(id),
  reason text NOT NULL CHECK (btrim(reason) <> ''), text text NOT NULL CHECK (btrim(text) <> ''),
  author_id uuid NOT NULL REFERENCES users(id), author_name text NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION protect_watch_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Handoff records cannot be deleted'; END IF;
  IF OLD.status = 'Accepted' THEN RAISE EXCEPTION 'Accepted handoff is immutable; append a correction'; END IF;
  IF ROW(NEW.id,NEW.station_id,NEW.command_id,NEW.station_name,NEW.team,NEW.outgoing_id,NEW.outgoing_name,NEW.previous_id,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.station_id,OLD.command_id,OLD.station_name,OLD.team,OLD.outgoing_id,OLD.outgoing_name,OLD.previous_id,OLD.created_at)
    THEN RAISE EXCEPTION 'Handoff identity and lineage cannot change'; END IF;
  IF NEW.revision <> OLD.revision + 1 THEN RAISE EXCEPTION 'Handoff revision must advance exactly once'; END IF;
  IF NOT ((OLD.status = 'Draft' AND NEW.status IN ('Draft','Ready for review')) OR (OLD.status = 'Ready for review' AND NEW.status IN ('Draft','Accepted')))
    THEN RAISE EXCEPTION 'Invalid handoff transition'; END IF;
  IF OLD.status = 'Ready for review' AND ROW(NEW.incoming_id,NEW.incoming_name,NEW.watch_start,NEW.watch_end,NEW.content)
    IS DISTINCT FROM ROW(OLD.incoming_id,OLD.incoming_name,OLD.watch_start,OLD.watch_end,OLD.content)
    THEN RAISE EXCEPTION 'Return Ready handoff to Draft before editing'; END IF;
  IF NEW.status = 'Accepted' AND EXISTS (SELECT 1 FROM jsonb_each(NEW.content->'checklist') c WHERE c.value <> 'true'::jsonb)
    AND btrim(coalesce(NEW.acceptance_exceptions,'')) = '' THEN RAISE EXCEPTION 'Acceptance exceptions required for incomplete checks'; END IF;
  NEW.updated_at = clock_timestamp(); RETURN NEW;
END;
$$;
CREATE TRIGGER watch_handoff_guard BEFORE UPDATE OR DELETE ON watch_handoffs FOR EACH ROW EXECUTE FUNCTION protect_watch_handoff();
CREATE TRIGGER watch_handoff_no_truncate BEFORE TRUNCATE ON watch_handoffs FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TRIGGER watch_station_events_immutable BEFORE UPDATE OR DELETE ON watch_station_events FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER watch_station_events_no_truncate BEFORE TRUNCATE ON watch_station_events FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TRIGGER watch_handoff_events_immutable BEFORE UPDATE OR DELETE ON watch_handoff_events FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER watch_handoff_events_no_truncate BEFORE TRUNCATE ON watch_handoff_events FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
CREATE TRIGGER watch_handoff_corrections_immutable BEFORE UPDATE OR DELETE ON watch_handoff_corrections FOR EACH ROW EXECUTE FUNCTION refuse_change();
CREATE TRIGGER watch_handoff_corrections_no_truncate BEFORE TRUNCATE ON watch_handoff_corrections FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
COMMENT ON TABLE watch_handoffs IS 'Station/team watch handover, separate from message acknowledgements, task completion, and transmission.';

CREATE FUNCTION validate_watch_correction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM watch_handoffs WHERE id=NEW.handoff_id AND status='Accepted') THEN RAISE EXCEPTION 'Corrections require an accepted handoff'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER watch_correction_target BEFORE INSERT ON watch_handoff_corrections FOR EACH ROW EXECUTE FUNCTION validate_watch_correction();
