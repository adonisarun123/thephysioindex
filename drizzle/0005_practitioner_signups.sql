CREATE TABLE "practitioner_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"full_name" text NOT NULL,
	"mobile" text NOT NULL,
	"email" text,
	"city" text NOT NULL,
	"practice_type" text NOT NULL,
	"registration_number" text,
	"attribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "practitioner_signups_reference_uq" ON "practitioner_signups" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "practitioner_signups_status_idx" ON "practitioner_signups" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "practitioner_signups_mobile_idx" ON "practitioner_signups" USING btree ("mobile","created_at");