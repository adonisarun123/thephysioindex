-- EMR-07: grants (DAT-11) and checks for patient documents.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_documents TO tpi_app;--> statement-breakpoint
ALTER TABLE public.patient_documents ADD CONSTRAINT patient_documents_category_chk CHECK (category IN ('report','imaging','prescription','consent','other'));--> statement-breakpoint
ALTER TABLE public.patient_documents ADD CONSTRAINT patient_documents_mime_chk CHECK (mime IN ('application/pdf','image/jpeg','image/png','image/webp'));--> statement-breakpoint
ALTER TABLE public.patient_documents ADD CONSTRAINT patient_documents_bytes_chk CHECK (bytes BETWEEN 1 AND 4194304);
