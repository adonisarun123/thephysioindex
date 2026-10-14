import { VERIFICATION_LABELS, type VerificationCategory } from "@/lib/verification";

const STYLE: Record<VerificationCategory, string> = {
  registration_checked: "bg-brand text-white border-brand",
  document_reviewed: "bg-brand-soft text-brand-ink border-brand/40",
  enrolment_only: "bg-surface text-brand-ink border-brand/40",
  membership_only: "bg-surface text-foreground border-line",
  not_verified: "bg-surface text-muted border-line border-dashed",
  restricted: "bg-surface text-foreground border-foreground/40",
};

/** The label is the check performed, not a quality judgement (VER-01, VER-06). */
export function VerificationBadge({ category, size = "sm" }: { category: VerificationCategory; size?: "sm" | "md" }) {
  const meta = VERIFICATION_LABELS[category];
  return (
    <span
      className={`inline-flex items-center rounded border px-2 ${size === "md" ? "py-1 text-sm" : "py-0.5 text-xs"} font-medium leading-tight ${STYLE[category]}`}
      title={meta.explanation}
    >
      {meta.label}
    </span>
  );
}
