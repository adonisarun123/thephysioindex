/**
 * Patient-facing verification labels (VER-01 table). A label describes the
 * check performed, never treatment quality (VER-06).
 */
export type VerificationCategory =
  | "registration_checked"
  | "document_reviewed"
  | "enrolment_only"
  | "membership_only"
  | "not_verified"
  | "restricted";

export const VERIFICATION_LABELS: Record<VerificationCategory, { label: string; short: string; explanation: string }> = {
  registration_checked: {
    label: "Registration checked",
    short: "Registration checked",
    explanation: "We checked this registration with the issuing council and show the issuer, approved public number and date checked.",
  },
  document_reviewed: {
    label: "Document reviewed",
    short: "Document reviewed",
    explanation: "A reviewer examined a document the practitioner supplied. A live registry did not confirm it.",
  },
  enrolment_only: {
    label: "Enrolment only",
    short: "Enrolment only",
    explanation: "An allied-health enrolment identifier was reviewed. Enrolment is not a licence.",
  },
  membership_only: {
    label: "Association membership",
    short: "Membership",
    explanation: "Membership of a professional association. This is not a licence.",
  },
  not_verified: {
    label: "Not independently verified",
    short: "Not verified",
    explanation: "Credentials are self-declared or pending review.",
  },
  restricted: {
    label: "Verification withdrawn",
    short: "Withdrawn",
    explanation: "A credential has expired, been suspended or revoked. Booking is restricted until it is renewed.",
  },
};

/**
 * SQL expression computing the category from a practitioner's credentials.
 * Expects the alias `p` for practitioners in the surrounding query.
 */
export const VERIFICATION_CATEGORY_SQL = `
  (
    select case
      when bool_or(c.status in ('expired','suspended','revoked') and c.type = 'statutory_registration') then 'restricted'
      when bool_or(c.status = 'registration_checked' and c.type = 'statutory_registration') then 'registration_checked'
      when bool_or(c.status in ('registration_checked','document_reviewed') and c.type in ('statutory_registration','degree')) then 'document_reviewed'
      when bool_or(c.status in ('registration_checked','document_reviewed') and c.type = 'enrolment') then 'enrolment_only'
      when bool_or(c.status in ('registration_checked','document_reviewed') and c.type = 'association_membership') then 'membership_only'
      else 'not_verified'
    end
    from credentials c where c.practitioner_id = p.id
  )
`;

export function verificationCategory(
  credentials: { type: string; status: string }[],
): VerificationCategory {
  const has = (pred: (c: { type: string; status: string }) => boolean) => credentials.some(pred);
  if (has((c) => ["expired", "suspended", "revoked"].includes(c.status) && c.type === "statutory_registration")) return "restricted";
  if (has((c) => c.status === "registration_checked" && c.type === "statutory_registration")) return "registration_checked";
  if (has((c) => ["registration_checked", "document_reviewed"].includes(c.status) && ["statutory_registration", "degree"].includes(c.type))) return "document_reviewed";
  if (has((c) => ["registration_checked", "document_reviewed"].includes(c.status) && c.type === "enrolment")) return "enrolment_only";
  if (has((c) => ["registration_checked", "document_reviewed"].includes(c.status) && c.type === "association_membership")) return "membership_only";
  return "not_verified";
}
