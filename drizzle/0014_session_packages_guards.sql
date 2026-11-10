-- Session packages (PKG-01..04): updated_at triggers (DAT-14), runtime grants (DAT-11), value checks. Money is integer paise (OFR-02).
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.package_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.patient_packages FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_templates, public.patient_packages, public.package_session_uses TO tpi_app;--> statement-breakpoint
ALTER TABLE public.package_templates ADD CONSTRAINT package_templates_values_chk CHECK (sessions BETWEEN 2 AND 100 AND price_paise >= 0 AND validity_days BETWEEN 7 AND 730);--> statement-breakpoint
ALTER TABLE public.patient_packages ADD CONSTRAINT patient_packages_values_chk CHECK (sessions_total BETWEEN 1 AND 100 AND price_paise >= 0 AND paid_paise BETWEEN 0 AND price_paise AND expires_on >= starts_on);--> statement-breakpoint
ALTER TABLE public.patient_packages ADD CONSTRAINT patient_packages_state_chk CHECK (state IN ('active','closed'));--> statement-breakpoint
ALTER TABLE public.patient_packages ADD CONSTRAINT patient_packages_payment_mode_chk CHECK (payment_mode IS NULL OR payment_mode IN ('cash','upi','card','bank','other'));
