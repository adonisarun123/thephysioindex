/** Shared options for the practitioner sign-up landing page and its admin list. */
export const PRACTICE_TYPES = [
  { value: "clinic_owner", label: "I run my own clinic" },
  { value: "independent", label: "I consult at one or more clinics" },
  { value: "home_visits", label: "I mainly do home visits" },
  { value: "employed", label: "I work at a hospital or chain" },
  { value: "student", label: "I am an intern or student" },
] as const;

export const SIGNUP_STATUSES = ["new", "contacted", "onboarding", "onboarded", "not_eligible", "closed"] as const;

export const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid"] as const;

export function practiceTypeLabel(v: string): string {
  return PRACTICE_TYPES.find((p) => p.value === v)?.label ?? v;
}
