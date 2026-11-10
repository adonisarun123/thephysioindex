-- Home exercise plans (HEP-01..04): updated_at triggers (DAT-14), runtime grants (DAT-11), value checks.
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.exercises FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.exercise_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.exercise_plan_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercises, public.exercise_plans, public.exercise_plan_items, public.exercise_plan_checkins TO tpi_app;--> statement-breakpoint
ALTER TABLE public.exercises ADD CONSTRAINT exercises_owner_chk CHECK ((practitioner_id IS NULL) = (code IS NOT NULL));--> statement-breakpoint
ALTER TABLE public.exercises ADD CONSTRAINT exercises_region_chk CHECK (body_region IN ('neck','shoulder','elbow_wrist','back','hip','knee','ankle_foot','core','balance','general'));--> statement-breakpoint
ALTER TABLE public.exercises ADD CONSTRAINT exercises_dose_chk CHECK (coalesce(default_sets, 1) BETWEEN 1 AND 20 AND coalesce(default_reps, 1) BETWEEN 1 AND 200 AND coalesce(default_hold_seconds, 1) BETWEEN 1 AND 600);--> statement-breakpoint
ALTER TABLE public.exercise_plans ADD CONSTRAINT exercise_plans_state_chk CHECK (state IN ('active','archived'));--> statement-breakpoint
ALTER TABLE public.exercise_plans ADD CONSTRAINT exercise_plans_link_version_chk CHECK (link_version >= 1);--> statement-breakpoint
ALTER TABLE public.exercise_plan_items ADD CONSTRAINT exercise_plan_items_dose_chk CHECK (coalesce(sets, 1) BETWEEN 1 AND 20 AND coalesce(reps, 1) BETWEEN 1 AND 200 AND coalesce(hold_seconds, 1) BETWEEN 1 AND 600 AND position BETWEEN 0 AND 49);--> statement-breakpoint
ALTER TABLE public.exercise_plan_checkins ADD CONSTRAINT exercise_plan_checkins_pain_chk CHECK (pain_score IS NULL OR pain_score BETWEEN 0 AND 10);
