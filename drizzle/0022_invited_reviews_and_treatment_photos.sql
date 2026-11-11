CREATE TABLE "review_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"patient_label" text NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"review_id" uuid,
	"uploaded_by_user_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"external_id" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"caption" text,
	"consent_basis" text NOT NULL,
	"consent_statement" text NOT NULL,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state" "moderation_state" DEFAULT 'pending' NOT NULL,
	"moderation_reason" text,
	"moderated_by_user_id" uuid,
	"moderated_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"removed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "patient_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "source" text DEFAULT 'booking' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "invitation_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "author_user_id" uuid;--> statement-breakpoint
ALTER TABLE "review_invitations" ADD CONSTRAINT "review_invitations_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_invitations" ADD CONSTRAINT "review_invitations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_photos" ADD CONSTRAINT "treatment_photos_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_photos" ADD CONSTRAINT "treatment_photos_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_photos" ADD CONSTRAINT "treatment_photos_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatment_photos" ADD CONSTRAINT "treatment_photos_moderated_by_user_id_users_id_fk" FOREIGN KEY ("moderated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_invitations_practitioner_idx" ON "review_invitations" USING btree ("practitioner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "treatment_photos_object_key_uq" ON "treatment_photos" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "treatment_photos_practitioner_idx" ON "treatment_photos" USING btree ("practitioner_id","state");--> statement-breakpoint
CREATE INDEX "treatment_photos_review_idx" ON "treatment_photos" USING btree ("review_id");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_invitation_uq" ON "reviews" USING btree ("invitation_id");