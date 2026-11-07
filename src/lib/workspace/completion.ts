import type { ProfileDraft } from "./draft";

/**
 * Profile completion (PRO-03, owner decision 7 Nov 2026).
 *
 * One fixed checklist drives the completion meter, the pending actions and the
 * submission gate, so "100%" means the same thing everywhere: a profile can be
 * submitted for verification only when every applicable item is done, and only
 * a verified (published) profile takes bookings. Registration sign-up covers the
 * first four items; the practitioner finishes the rest in the workspace.
 *
 * Weekly hours apply only to practitioners with a clinic: home-visit and online
 * services are enquiry-only in R1 (LOC-04, CAL-04), so hours cannot block them.
 */
export type CompletionExtra = {
  credentialCount: number;
  branchCount: number;
  clinicCount: number;
  offeringCount: number;
  availabilityRuleCount: number;
  consents: boolean;
};

export type CompletionItem = { key: string; label: string; todo: string; done: boolean; href: string };

export const ABOUT_MIN_CHARS = 100;

export function profileChecklist(content: ProfileDraft, extra: CompletionExtra): CompletionItem[] {
  const name = content.identity?.displayName?.trim() ?? "";
  const items: CompletionItem[] = [
    { key: "basics", label: "Name and qualification", todo: "Add your name and at least one qualification", done: name.length >= 2 && (content.qualifications?.length ?? 0) > 0, href: "/workspace/profile#identity" },
    { key: "registration", label: "Registration number", todo: "Add your council registration or IAP number", done: extra.credentialCount > 0, href: "/workspace/profile#credentials" },
    { key: "practice", label: "Where you practise", todo: "Add a clinic address or a home-visit area", done: extra.branchCount > 0, href: "/workspace/clinics" },
    { key: "consent", label: "Terms and publication consent", todo: "Accept provider terms and publication consent", done: extra.consents, href: "/workspace/onboarding?step=consent" },
    { key: "about", label: "About you", todo: `Write your About section (at least ${ABOUT_MIN_CHARS} characters)`, done: (content.about?.trim().length ?? 0) >= ABOUT_MIN_CHARS, href: "/workspace/profile#about" },
    { key: "specialty", label: "Main area of practice", todo: "Choose your main area of practice", done: Boolean(content.specialties?.some((s) => s.isPrimary)), href: "/workspace/profile#expertise" },
    { key: "languages", label: "Languages", todo: "Add the languages you consult in", done: (content.languages?.length ?? 0) > 0, href: "/workspace/profile#expertise" },
    { key: "services", label: "Services and fees", todo: "Add at least one service with its fee", done: extra.offeringCount > 0, href: "/workspace/clinics" },
  ];
  if (extra.clinicCount > 0) {
    items.push({ key: "hours", label: "Weekly hours", todo: "Publish your weekly clinic hours", done: extra.availabilityRuleCount > 0, href: "/workspace/calendar" });
  }
  return items;
}

export function completionPercent(items: CompletionItem[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}
