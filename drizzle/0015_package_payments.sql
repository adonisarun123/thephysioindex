CREATE TABLE "package_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"receipt_no" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"payment_mode" text,
	"received_on" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_counters" (
	"practitioner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "package_payments" ADD CONSTRAINT "package_payments_package_id_patient_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."patient_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_payments" ADD CONSTRAINT "package_payments_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_payments" ADD CONSTRAINT "package_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_counters" ADD CONSTRAINT "practice_counters_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "package_payments_receipt_uq" ON "package_payments" USING btree ("practitioner_id","receipt_no");--> statement-breakpoint
CREATE INDEX "package_payments_package_idx" ON "package_payments" USING btree ("package_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_counters_uq" ON "practice_counters" USING btree ("practitioner_id","kind");