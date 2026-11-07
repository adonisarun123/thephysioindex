/** Client-safe option lists for the registration form (no server imports). */

export const PRACTICE_MODES = [
  { value: "clinic_owner", label: "My own clinic", kind: "clinic" },
  { value: "independent", label: "A clinic I consult at", kind: "clinic" },
  { value: "home_visits", label: "Home visits", kind: "service_area" },
] as const;

export const DEGREES = ["BPT", "MPT", "DPT", "PhD (Physiotherapy)", "Diploma in Physiotherapy"] as const;
