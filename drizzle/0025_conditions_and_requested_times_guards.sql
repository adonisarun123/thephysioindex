-- Conditions treated (PRO-08) and requested appointment times on enquiries (CAL-10): updated_at trigger (DAT-14), runtime grants (DAT-11), checks.
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.conditions FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
GRANT SELECT ON public.conditions TO tpi_app;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.practitioner_conditions TO tpi_app;--> statement-breakpoint
-- A requested time always names the service it was requested for.
ALTER TABLE public.enquiries ADD CONSTRAINT enquiries_requested_time_chk CHECK (requested_starts_at IS NULL OR offering_id IS NOT NULL);
