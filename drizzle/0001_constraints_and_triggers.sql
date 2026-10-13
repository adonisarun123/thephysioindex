-- Hand-written migration: database-enforced invariants the ORM cannot express.
-- SRS references: BKG-08, BKG-09, DAT-15, DAT-19, DAT-22, Section 23.

-- ---------------------------------------------------------------------------
-- 1. Practitioner capacity: the final overlap guard (BKG-08, Section 23).
--    Held and committed reservations block capacity. Expired holds remain
--    blocking until explicitly transitioned (BKG-09, DAT-19); no now() here.
-- ---------------------------------------------------------------------------
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_no_overlap"
  EXCLUDE USING gist ("resource_id" WITH =, "occupied_range" WITH &&)
  WHERE (state IN ('held', 'committed'));--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Patient overlap guard on the appointment interval, not the buffered
--    practitioner interval (DAT-22). Dependants are separate patient rows, so
--    two dependants of one guardian may book concurrently (BKG-16).
-- ---------------------------------------------------------------------------
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_patient_no_overlap"
  EXCLUDE USING gist ("patient_id" WITH =, tstzrange("starts_at", "ends_at", '[)') WITH &&)
  WHERE (state IN ('held', 'committed') AND patient_id IS NOT NULL);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. updated_at maintenance for every table that carries the column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;--> statement-breakpoint

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.column_name = 'updated_at'
      AND t.table_type = 'BASE TABLE'
      AND c.table_schema IN ('public', 'analytics')
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_at ON %I.%I; CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      r.table_schema, r.table_name, r.table_schema, r.table_name
    );
  END LOOP;
END;
$$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. Practitioner search vector (DAT-09). Weighted: name > headline/designation.
--    Specialty and locality terms are appended by the application when the
--    published projection is refreshed (DAT-02).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION practitioners_search_vector_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.display_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.designation, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.headline, '')), 'C');
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_practitioners_search_vector
  BEFORE INSERT OR UPDATE OF display_name, designation, headline ON "practitioners"
  FOR EACH ROW EXECUTE FUNCTION practitioners_search_vector_update();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Append-only protection for event/audit tables (Section 22).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'booking_events', 'booking_revisions', 'audit_events', 'record_access_log',
    'case_events', 'support_case_events', 'consent_records', 'offer_counter_events',
    'config_history', 'feature_flag_events'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_append_only ON %I; CREATE TRIGGER trg_append_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_mutation();',
      t, t
    );
  END LOOP;
END;
$$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 6. Historical appointments must never be hard-deleted in normal operation
--    (Section 21). Deletion is restricted; anonymisation is a workflow.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_confirmed_booking_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('confirmed', 'completed', 'no_show') THEN
    RAISE EXCEPTION 'booking % cannot be deleted; use the anonymisation workflow', OLD.reference
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;--> statement-breakpoint

CREATE TRIGGER trg_protect_booking_delete
  BEFORE DELETE ON "bookings" FOR EACH ROW EXECUTE FUNCTION protect_confirmed_booking_delete();--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 7. Booking reference generator: TPI- + 6 chars from an unambiguous alphabet
--    (no 0/O/1/I). Uniqueness is enforced by bookings_reference_uq; callers
--    retry on collision.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_booking_reference() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  out text := '';
  i int;
BEGIN
  FOR i IN 1..6 LOOP
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  END LOOP;
  RETURN 'TPI-' || out;
END;
$$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 8. Expire elapsed holds for one calendar, inside the caller's transaction,
--    after the calendar row lock is taken (BKG-07 step 2, BKG-09).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_elapsed_holds(p_resource_id uuid) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  UPDATE reservations
     SET state = 'expired', released_reason = 'hold_expired'
   WHERE resource_id = p_resource_id
     AND state = 'held'
     AND expires_at <= now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 9. Least-privilege runtime role (DAT-05, DAT-11). The app connects as
--    tpi_app; it cannot own the schema or run DDL. Password is set out of band.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tpi_app') THEN
    CREATE ROLE tpi_app NOLOGIN;
  END IF;
END;
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public, analytics TO tpi_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, analytics TO tpi_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public, analytics TO tpi_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tpi_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tpi_app;
