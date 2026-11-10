-- ENQ-02: outcome values for the practitioner enquiry inbox.
ALTER TABLE public.enquiries ADD CONSTRAINT enquiries_outcome_chk CHECK (outcome IS NULL OR outcome IN ('booked','not_interested','no_response','other'));
