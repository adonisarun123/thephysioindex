/**
 * "Your profile is live" email (Section 13; owner request 11 Nov 2026).
 *
 * Sent once, when a new listing is approved and published. It gives the
 * physiotherapist their public link, says plainly whether patients can book
 * online yet, and lists what is still missing, split into what they must do
 * and what the platform is doing. Pure: the dispatcher loads the facts at
 * send time, so the email reflects the state after the whole approval
 * (publish → registration check → booking switch) has committed.
 */

export type EligibilityKey = "claimed" | "contact" | "published" | "offering" | "credential" | "not_suspended";

export type LiveProfileFacts = {
  displayName: string;
  profileUrl: string;
  workspaceUrl: string;
  bookingEligible: boolean;
  /** Active offerings at approved, published places, by mode. */
  clinicOfferings: number;
  otherOfferings: number;
  /** Completion checklist items still open (their "todo" wording) and the meter value. */
  openItems: string[];
  percent: number;
  /** VER-04 checks that fail (keys from bookingEligibilityChecklist). */
  failingChecks: EligibilityKey[];
  /** Optional extras that never block (recommendedAdditions). */
  optional: string[];
};

/** What the physiotherapist can fix, in their words. Platform-side checks are listed separately. */
const PHYSIO_ACTION: Partial<Record<EligibilityKey, string>> = {
  contact: "Verify your email address or mobile number in your workspace",
  offering: "Add at least one service with its fee at your clinic",
};

/** Checks only our team can clear. "credential" = registration accepted for booking (VER-03/VER-04). */
const TEAM_ACTION: Partial<Record<EligibilityKey, string>> = {
  credential: "We are completing the registration check that online booking needs. Nothing to do on your side; we will email you as soon as online booking is on.",
  published: "Your profile is still being published. If it does not open within an hour, reply to this email.",
};

export function firstNameOf(displayName: string): string {
  const cleaned = displayName.replace(/^(dr\.?|mr\.?|ms\.?|mrs\.?)\s+/i, "").trim();
  return cleaned.split(/\s+/)[0] || "there";
}

/** Booking status paragraph. Home visits and online sessions are request-only in R1 (LOC-04, CAL-04, BKG-06). */
export function bookingStatusText(f: LiveProfileFacts): string {
  if (f.bookingEligible && f.clinicOfferings > 0) {
    return "Patients can now book appointments with you online. You will get an email for every new booking, and you can see them under Appointments in your workspace.";
  }
  if (f.clinicOfferings === 0 && f.otherOfferings > 0) {
    return "Patients can send you appointment requests from your profile. Home visits and online sessions are taken as requests for now: each request comes to your inbox by email and you call or WhatsApp the patient to fix a time.";
  }
  return "Patients can see your profile and send you appointment requests (you get an email for each one). Online booking is not switched on yet; see below for what is pending.";
}

/** Plain-text pending list; never empty, because templates refuse empty variables. */
export function pendingListText(f: LiveProfileFacts): string {
  const relevantFailing = f.failingChecks.filter((k) => !(k === "credential" && f.clinicOfferings === 0));
  const youDo = [...f.openItems, ...relevantFailing.flatMap((k) => (PHYSIO_ACTION[k] ? [PHYSIO_ACTION[k]!] : []))];
  const weDo = relevantFailing.flatMap((k) => (TEAM_ACTION[k] ? [TEAM_ACTION[k]!] : []));

  const out: string[] = [];
  if (youDo.length) {
    out.push(`What you still need to do (profile ${f.percent}% complete):`);
    for (const item of dedupe(youDo)) out.push(`- ${item}`);
  } else {
    out.push(`Your profile is 100% complete. Nothing is pending on your side.`);
  }
  if (weDo.length) {
    out.push("", "What we are doing:");
    for (const item of weDo) out.push(`- ${item}`);
  }
  if (f.optional.length) {
    out.push("", "Optional, but it helps patients choose you:");
    for (const item of f.optional) out.push(`- ${item}`);
  }
  return out.join("\n");
}

export function liveProfileVars(f: LiveProfileFacts): Record<string, string> {
  return {
    firstName: firstNameOf(f.displayName),
    profileUrl: f.profileUrl,
    bookingStatus: bookingStatusText(f),
    pendingList: pendingListText(f),
    workspaceUrl: f.workspaceUrl,
  };
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}
