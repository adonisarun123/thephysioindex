-- RCP-01: grants (DAT-11), checks, and one opening receipt per package already paid before the ledger existed.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_payments, public.practice_counters TO tpi_app;--> statement-breakpoint
ALTER TABLE public.package_payments ADD CONSTRAINT package_payments_amount_chk CHECK (amount_paise > 0);--> statement-breakpoint
ALTER TABLE public.package_payments ADD CONSTRAINT package_payments_mode_chk CHECK (payment_mode IS NULL OR payment_mode IN ('cash','upi','card','bank','other'));--> statement-breakpoint
ALTER TABLE public.practice_counters ADD CONSTRAINT practice_counters_next_chk CHECK (next_value >= 1);--> statement-breakpoint
WITH paid AS (
  SELECT pp.id, pp.practitioner_id, pp.paid_paise, pp.payment_mode, pp.starts_on, pp.created_by,
         row_number() OVER (PARTITION BY pp.practitioner_id ORDER BY pp.created_at, pp.id) AS n
  FROM public.patient_packages pp
  WHERE pp.paid_paise > 0 AND NOT EXISTS (SELECT 1 FROM public.package_payments x WHERE x.package_id = pp.id)
), ins AS (
  INSERT INTO public.package_payments (package_id, practitioner_id, receipt_no, amount_paise, payment_mode, received_on, created_by)
  SELECT id, practitioner_id, 'R-' || lpad(n::text, 5, '0'), paid_paise, payment_mode, starts_on, created_by FROM paid
  RETURNING practitioner_id
)
INSERT INTO public.practice_counters (practitioner_id, kind, next_value)
SELECT practitioner_id, 'receipt', count(*) + 1 FROM ins GROUP BY practitioner_id
ON CONFLICT (practitioner_id, kind) DO UPDATE SET next_value = public.practice_counters.next_value + excluded.next_value - 1;
