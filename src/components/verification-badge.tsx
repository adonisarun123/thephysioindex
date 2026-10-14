import { VERIFICATION_LABELS, type VerificationCategory } from "@/lib/verification";

const STYLE: Record<VerificationCategory, string> = {
  registration_checked: "bg-brand text-white",
  document_reviewed: "bg-brand-soft text-brand-ink",
  enrolment_only: "bg-surface-2 text-brand-ink",
  membership_only: "bg-surface-2 text-ink-2",
  not_verified: "bg-surface text-muted ring-1 ring-inset ring-line-strong",
  restricted: "bg-alert-soft text-alert",
};

/** The label is the check performed, not a quality judgement (VER-01, VER-06). */
export function VerificationBadge({ category, size = "sm" }: { category: VerificationCategory; size?: "sm" | "md" }) {
  const meta = VERIFICATION_LABELS[category];
  return (
    <span className={`pill ${size === "md" ? "px-3 py-1 text-sm" : ""} ${STYLE[category]}`} title={meta.explanation}>
      {meta.label}
    </span>
  );
}
