CREATE TABLE "conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"body_area" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practitioner_conditions" (
	"practitioner_id" uuid NOT NULL,
	"condition_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "requested_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "offering_id" uuid;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "booking_id" uuid;--> statement-breakpoint
ALTER TABLE "practitioner_conditions" ADD CONSTRAINT "practitioner_conditions_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practitioner_conditions" ADD CONSTRAINT "practitioner_conditions_condition_id_conditions_id_fk" FOREIGN KEY ("condition_id") REFERENCES "public"."conditions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conditions_slug_uq" ON "conditions" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "practitioner_conditions_uq" ON "practitioner_conditions" USING btree ("practitioner_id","condition_id");--> statement-breakpoint
CREATE INDEX "practitioner_conditions_condition_idx" ON "practitioner_conditions" USING btree ("condition_id");