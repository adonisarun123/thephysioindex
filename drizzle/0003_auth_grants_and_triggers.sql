-- Grants for the runtime role on the auth schema and new tables (DAT-05).
GRANT USAGE ON SCHEMA auth TO tpi_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO tpi_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO tpi_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tpi_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tpi_app;--> statement-breakpoint

-- updated_at triggers for tables created after migration 0001.
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
      AND NOT EXISTS (
        SELECT 1 FROM pg_trigger tg
        JOIN pg_class cl ON cl.oid = tg.tgrelid
        JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE tg.tgname = 'trg_set_updated_at' AND cl.relname = c.table_name AND ns.nspname = c.table_schema
      )
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      r.table_schema, r.table_name
    );
  END LOOP;
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_append_only ON content_revisions;--> statement-breakpoint
CREATE TRIGGER trg_append_only BEFORE UPDATE OR DELETE ON content_revisions FOR EACH ROW EXECUTE FUNCTION reject_mutation();
