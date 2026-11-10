ALTER TABLE "enquiries" ADD COLUMN "contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "follow_up_on" date;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "practitioner_note" text;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "outcome" text;--> statement-breakpoint
CREATE INDEX "enquiries_follow_up_idx" ON "enquiries" USING btree ("practitioner_id","follow_up_on");