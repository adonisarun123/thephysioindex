CREATE TABLE "package_session_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"used_on" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sessions" smallint NOT NULL,
	"price_paise" integer NOT NULL,
	"validity_days" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"template_id" uuid,
	"name" text NOT NULL,
	"patient_label" text NOT NULL,
	"sessions_total" smallint NOT NULL,
	"price_paise" integer NOT NULL,
	"paid_paise" integer DEFAULT 0 NOT NULL,
	"payment_mode" text,
	"starts_on" date NOT NULL,
	"expires_on" date NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "package_session_uses" ADD CONSTRAINT "package_session_uses_package_id_patient_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."patient_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_session_uses" ADD CONSTRAINT "package_session_uses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_templates" ADD CONSTRAINT "package_templates_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_templates" ADD CONSTRAINT "package_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_template_id_package_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."package_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "package_session_uses_package_idx" ON "package_session_uses" USING btree ("package_id","used_on");--> statement-breakpoint
CREATE INDEX "package_templates_practitioner_idx" ON "package_templates" USING btree ("practitioner_id","is_active");--> statement-breakpoint
CREATE INDEX "patient_packages_practitioner_idx" ON "patient_packages" USING btree ("practitioner_id","state","expires_on");