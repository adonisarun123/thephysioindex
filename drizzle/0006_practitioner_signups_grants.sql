-- practitioner_signups: updated_at trigger (DAT-14) and runtime grants (DAT-11).
-- Default privileges already cover new tables; the explicit grant keeps this
-- migration correct even if those defaults change.
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.practitioner_signups FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practitioner_signups TO tpi_app;--> statement-breakpoint
ALTER TABLE public.practitioner_signups ADD CONSTRAINT practitioner_signups_status_chk CHECK (status IN ('new','contacted','onboarding','onboarded','not_eligible','closed'));--> statement-breakpoint
ALTER TABLE public.practitioner_signups ADD CONSTRAINT practitioner_signups_practice_type_chk CHECK (practice_type IN ('clinic_owner','independent','home_visits','employed','student'));
