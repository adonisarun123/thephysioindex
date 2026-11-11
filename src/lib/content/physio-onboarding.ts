/**
 * Onboarding help for physiotherapists (PRO-03; owner request 11 Nov 2026).
 *
 * One source for the "keep ready" checklist and the questions shown on
 * /for-physiotherapists and the join form, so the two pages cannot drift.
 * Every statement must match the product as built (DIR-14): no listing fee or
 * commission at launch, nothing public before verification, home visits and
 * online sessions take enquiries rather than instant bookings (LOC-04).
 */

export type ChecklistItem = { title: string; detail: string };

/** Needed to register: the join form asks for exactly these. */
export const KEEP_READY: ChecklistItem[] = [
  { title: "Your email and mobile number", detail: "We send a 6-digit code to your email to verify it. Your mobile is how our team reaches you." },
  { title: "Your qualification and college", detail: "BPT, MPT (with specialisation) or equivalent, and where you studied." },
  { title: "Your registration number", detail: "State council registration or IAP membership number, as printed on your certificate." },
  { title: "Where you see patients", detail: "Clinic name, full address and PIN code, or the locality you cover for home visits." },
];

/** Needed to reach 100% and go live: the finish screen asks for these. */
export const TO_GO_LIVE: ChecklistItem[] = [
  { title: "A clear photo of yourself", detail: "Face visible, plain background. Profiles with a photo look more trustworthy to patients." },
  { title: "A short About section", detail: "Three or four sentences. We give you a starting draft that you can edit." },
  { title: "Your areas of practice", detail: "One main area plus any others you treat, such as orthopaedic, neuro, sports or post-surgical. Tick boxes, no typing." },
  { title: "Languages you consult in", detail: "Patients often filter by language." },
  { title: "One service and its fee", detail: "For example, an initial assessment and what you charge for it. Add more services later." },
  { title: "Clinic hours", detail: "Days and timings for each clinic. Not needed if you only do home visits." },
];

export const ONBOARDING_FAQ: { q: string; a: string }[] = [
  { q: "How long does registration take?", a: "About two minutes if you have your registration number at hand. Registration creates your profile; one more screen takes it to 100%." },
  { q: "What do I need to keep ready?", a: "Your email, mobile number, qualification and college, council registration or IAP membership number, and your clinic address or home-visit locality." },
  { q: "Is there a fee?", a: "No. There is no listing fee and no commission on appointments at launch. Patients pay you directly." },
  { q: "When does my profile go live?", a: "After you submit a 100% complete profile, our team checks your registration. We email you when the profile is live. Nothing is public before that." },
  { q: "I only do home visits. Can I list?", a: "Yes. Choose home visits and pick the locality you cover. Your home address and PIN code are never shown. Patients send you an enquiry for home visits." },
  { q: "I work at more than one clinic. Can I add all of them?", a: "Yes. Register with one, then add your other clinics and their hours from your workspace." },
  { q: "Do I have to upload my certificate?", a: "Not to register. We check your registration number against the council or association record. If we cannot confirm it, we will ask you for a copy." },
  { q: "Can I change my fee, hours or services later?", a: "Yes, at any time from your workspace. Changes to your profile details are reviewed before they go live." },
  { q: "A profile with my name already exists. What should I do?", a: "Claim it instead of creating a second one. We verify that it is you before handing over control." },
  { q: "Can I get help registering?", a: "Yes. Leave your name and WhatsApp number on the registration page and our team will call you and complete it with you." },
];
