-- Patient records (EMR-01..07): triggers (DAT-14), grants (DAT-11), checks, links from plans and packages.
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.practice_patients FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.patient_visits FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.practice_records_terms, public.practice_patients, public.patient_visits TO tpi_app;--> statement-breakpoint
ALTER TABLE public.practice_patients ADD CONSTRAINT practice_patients_sex_chk CHECK (sex IS NULL OR sex IN ('female','male','other'));--> statement-breakpoint
ALTER TABLE public.practice_patients ADD CONSTRAINT practice_patients_birth_year_chk CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100);--> statement-breakpoint
ALTER TABLE public.patient_visits ADD CONSTRAINT patient_visits_kind_chk CHECK (kind IN ('assessment','follow_up','review','discharge','addendum'));--> statement-breakpoint
ALTER TABLE public.patient_visits ADD CONSTRAINT patient_visits_pain_chk CHECK (pain_score IS NULL OR pain_score BETWEEN 0 AND 10);--> statement-breakpoint
ALTER TABLE public.exercise_plans ADD CONSTRAINT exercise_plans_practice_patient_fk FOREIGN KEY (practice_patient_id) REFERENCES public.practice_patients(id);--> statement-breakpoint
ALTER TABLE public.patient_packages ADD CONSTRAINT patient_packages_practice_patient_fk FOREIGN KEY (practice_patient_id) REFERENCES public.practice_patients(id);--> statement-breakpoint
CREATE INDEX exercise_plans_practice_patient_idx ON public.exercise_plans (practice_patient_id) WHERE practice_patient_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX patient_packages_practice_patient_idx ON public.patient_packages (practice_patient_id) WHERE practice_patient_id IS NOT NULL;
