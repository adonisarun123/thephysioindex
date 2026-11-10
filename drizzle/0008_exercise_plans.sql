CREATE TABLE "exercise_plan_checkins" (
	"plan_id" uuid NOT NULL,
	"day" date NOT NULL,
	"pain_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"sets" smallint,
	"reps" smallint,
	"hold_seconds" smallint,
	"frequency" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"patient_label" text NOT NULL,
	"title" text NOT NULL,
	"advice" text,
	"state" text DEFAULT 'active' NOT NULL,
	"link_version" smallint DEFAULT 1 NOT NULL,
	"ends_on" date,
	"last_opened_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid,
	"code" text,
	"name" text NOT NULL,
	"body_region" text NOT NULL,
	"instructions" text NOT NULL,
	"default_sets" smallint,
	"default_reps" smallint,
	"default_hold_seconds" smallint,
	"default_frequency" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercise_plan_checkins" ADD CONSTRAINT "exercise_plan_checkins_plan_id_exercise_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."exercise_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_plan_items" ADD CONSTRAINT "exercise_plan_items_plan_id_exercise_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."exercise_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_plan_items" ADD CONSTRAINT "exercise_plan_items_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_plans" ADD CONSTRAINT "exercise_plans_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_plans" ADD CONSTRAINT "exercise_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_plan_checkins_uq" ON "exercise_plan_checkins" USING btree ("plan_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_plan_items_position_uq" ON "exercise_plan_items" USING btree ("plan_id","position");--> statement-breakpoint
CREATE INDEX "exercise_plans_practitioner_idx" ON "exercise_plans" USING btree ("practitioner_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_code_uq" ON "exercises" USING btree ("code") WHERE "exercises"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "exercises_practitioner_idx" ON "exercises" USING btree ("practitioner_id","body_region");