CREATE TABLE "patient_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"visit_on" date NOT NULL,
	"kind" text NOT NULL,
	"chief_complaint" text,
	"history" text,
	"pain_score" smallint,
	"findings" text,
	"diagnosis" text,
	"treatment_given" text,
	"plan" text,
	"next_visit_on" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"ref_no" text NOT NULL,
	"full_name" text NOT NULL,
	"mobile" text,
	"sex" text,
	"birth_year" smallint,
	"address" text,
	"emergency_contact" text,
	"referred_by" text,
	"medical_history" text,
	"notes" text,
	"consent_recorded_at" timestamp with time zone NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_records_terms" (
	"practitioner_id" uuid PRIMARY KEY NOT NULL,
	"terms_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_by" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercise_plans" ADD COLUMN "practice_patient_id" uuid;--> statement-breakpoint
ALTER TABLE "patient_packages" ADD COLUMN "practice_patient_id" uuid;--> statement-breakpoint
ALTER TABLE "patient_visits" ADD CONSTRAINT "patient_visits_patient_id_practice_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."practice_patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_visits" ADD CONSTRAINT "patient_visits_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_visits" ADD CONSTRAINT "patient_visits_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_patients" ADD CONSTRAINT "practice_patients_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_patients" ADD CONSTRAINT "practice_patients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_records_terms" ADD CONSTRAINT "practice_records_terms_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_records_terms" ADD CONSTRAINT "practice_records_terms_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "patient_visits_patient_idx" ON "patient_visits" USING btree ("patient_id","visit_on");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_patients_ref_uq" ON "practice_patients" USING btree ("practitioner_id","ref_no");--> statement-breakpoint
CREATE INDEX "practice_patients_practitioner_idx" ON "practice_patients" USING btree ("practitioner_id","archived_at","full_name");--> statement-breakpoint
CREATE INDEX "practice_patients_mobile_idx" ON "practice_patients" USING btree ("practitioner_id","mobile");