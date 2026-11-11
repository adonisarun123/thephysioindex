-- Invited reviews and patient photos: grants (DAT-11), shape checks and triggers.
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.review_invitations FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.treatment_photos FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_invitations TO tpi_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_photos TO tpi_app;--> statement-breakpoint
ALTER TABLE public.reviews ADD CONSTRAINT reviews_invitation_id_fk FOREIGN KEY (invitation_id) REFERENCES public.review_invitations(id);--> statement-breakpoint
ALTER TABLE public.reviews ADD CONSTRAINT reviews_source_chk CHECK (source IN ('booking','invitation'));--> statement-breakpoint
-- A review is either tied to a completed platform booking (REV-01) or to an invitation and the account that wrote it.
ALTER TABLE public.reviews ADD CONSTRAINT reviews_source_shape CHECK (
  (source = 'booking' AND booking_id IS NOT NULL AND patient_id IS NOT NULL AND invitation_id IS NULL)
  OR (source = 'invitation' AND invitation_id IS NOT NULL AND author_user_id IS NOT NULL AND booking_id IS NULL)
);--> statement-breakpoint
-- One invited review per account per physiotherapist, however many links they were sent.
CREATE UNIQUE INDEX reviews_invited_author_uq ON public.reviews (practitioner_id, author_user_id) WHERE source = 'invitation' AND state <> 'withdrawn';--> statement-breakpoint
ALTER TABLE public.review_invitations ADD CONSTRAINT review_invitations_label_len CHECK (char_length(patient_label) BETWEEN 1 AND 60);--> statement-breakpoint
ALTER TABLE public.treatment_photos ADD CONSTRAINT treatment_photos_kind_chk CHECK (kind IN ('practitioner','review'));--> statement-breakpoint
ALTER TABLE public.treatment_photos ADD CONSTRAINT treatment_photos_consent_chk CHECK (
  (kind = 'practitioner' AND consent_basis = 'practitioner_declared' AND review_id IS NULL)
  OR (kind = 'review' AND consent_basis = 'patient_own' AND review_id IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE public.treatment_photos ADD CONSTRAINT treatment_photos_statement_len CHECK (char_length(consent_statement) BETWEEN 20 AND 600);--> statement-breakpoint
ALTER TABLE public.treatment_photos ADD CONSTRAINT treatment_photos_caption_len CHECK (caption IS NULL OR char_length(caption) <= 140);--> statement-breakpoint
ALTER TABLE public.treatment_photos ADD CONSTRAINT treatment_photos_mime_chk CHECK (mime IN ('image/jpeg','image/png','image/webp'));--> statement-breakpoint
ALTER TABLE public.treatment_photos ADD CONSTRAINT treatment_photos_bytes_chk CHECK (bytes BETWEEN 1 AND 5242880);
