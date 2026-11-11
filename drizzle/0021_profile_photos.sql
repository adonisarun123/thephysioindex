ALTER TABLE "media_assets" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE INDEX "media_assets_practitioner_idx" ON "media_assets" USING btree ("practitioner_id","purpose");