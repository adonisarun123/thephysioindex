/** Controlled taxonomies and platform defaults (PRO-08, VER-01, VER-03, Section 2, Section 30). */

export const SPECIALTIES: { code: string; label: string; requiresEvidence?: boolean; description?: string }[] = [
  { code: "ortho", label: "Orthopaedic physiotherapy", description: "Musculoskeletal conditions, joint and spine pain, post-fracture rehabilitation" },
  { code: "sports", label: "Sports physiotherapy", description: "Sports injury prevention, rehabilitation and return-to-play" },
  { code: "neuro", label: "Neurological rehabilitation", description: "Stroke, Parkinson's, spinal cord injury, multiple sclerosis and other neurological conditions" },
  { code: "paediatric", label: "Paediatric physiotherapy", description: "Developmental delay, cerebral palsy and childhood conditions" },
  { code: "geriatric", label: "Geriatric physiotherapy", description: "Mobility, balance and fall prevention in older adults" },
  { code: "cardio_pulm", label: "Cardiopulmonary rehabilitation", description: "Cardiac and respiratory rehabilitation" },
  { code: "womens_health", label: "Women's health and pelvic floor", description: "Antenatal, postnatal and pelvic health physiotherapy" },
  { code: "post_surgical", label: "Post-surgical rehabilitation", description: "Recovery after joint replacement, ligament and spine surgery" },
  { code: "spine", label: "Spine and back care", description: "Low back pain, neck pain, disc conditions and posture" },
  { code: "manual_therapy", label: "Manual therapy", requiresEvidence: true, description: "Hands-on joint and soft tissue techniques" },
  { code: "dry_needling", label: "Dry needling", requiresEvidence: true },
  { code: "vestibular", label: "Vestibular rehabilitation", requiresEvidence: true, description: "Dizziness and balance disorders" },
  { code: "hand_therapy", label: "Hand therapy", requiresEvidence: true },
  { code: "pain_management", label: "Chronic pain management" },
  { code: "ergonomics", label: "Ergonomics and workplace health" },
  { code: "lymphoedema", label: "Lymphoedema management", requiresEvidence: true },
  { code: "oncology_rehab", label: "Oncology rehabilitation" },
  { code: "home_care", label: "Home-based rehabilitation" },
  { code: "general", label: "General physiotherapy" },
];

export const LANGUAGES: { code: string; label: string; nativeLabel?: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা" },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ" },
  { code: "or", label: "Odia", nativeLabel: "ଓଡ଼ିଆ" },
  { code: "as", label: "Assamese", nativeLabel: "অসমীয়া" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو" },
  { code: "kok", label: "Konkani" },
  { code: "tcy", label: "Tulu" },
  { code: "ne", label: "Nepali" },
  { code: "mni", label: "Manipuri (Meitei)" },
];

export const SERVICES: { code: string; label: string; kind: "initial_assessment" | "follow_up" | "procedure" | "package" | "other"; description?: string }[] = [
  { code: "initial_assessment", label: "Initial assessment", kind: "initial_assessment", description: "First consultation with examination and treatment plan" },
  { code: "follow_up", label: "Follow-up session", kind: "follow_up", description: "Treatment session for an existing plan" },
  { code: "sports_assessment", label: "Sports injury assessment", kind: "initial_assessment" },
  { code: "post_op_session", label: "Post-operative rehabilitation session", kind: "follow_up" },
  { code: "neuro_session", label: "Neuro rehabilitation session", kind: "follow_up" },
  { code: "paediatric_assessment", label: "Paediatric assessment", kind: "initial_assessment" },
  { code: "manual_therapy_session", label: "Manual therapy session", kind: "procedure" },
  { code: "dry_needling_session", label: "Dry needling session", kind: "procedure" },
  { code: "electrotherapy_session", label: "Electrotherapy session", kind: "procedure" },
  { code: "exercise_program", label: "Exercise programme session", kind: "follow_up" },
  { code: "posture_ergonomic", label: "Posture and ergonomic consultation", kind: "initial_assessment" },
];

export const CREDENTIAL_AUTHORITIES: {
  name: string;
  shortName?: string;
  kind: "statutory_regulator" | "enrolment_body" | "degree_awarding" | "professional_association" | "other";
  jurisdictionState?: string; // state code; undefined = national
  officialUrl?: string;
  lookupUrl?: string;
  acceptedForBooking: boolean;
  publicLabel: string;
}[] = [
  {
    name: "National Commission for Allied and Healthcare Professions",
    shortName: "NCAHP",
    kind: "enrolment_body",
    officialUrl: "https://ncahp.abdm.gov.in/",
    lookupUrl: "https://ahpr.abdm.gov.in/",
    acceptedForBooking: true,
    publicLabel: "NCAHP enrolment (enrolment only; not a licence)",
  },
  {
    name: "Indian Association of Physiotherapists",
    shortName: "IAP",
    kind: "professional_association",
    officialUrl: "https://www.physiotherapyindia.org/",
    acceptedForBooking: false,
    publicLabel: "IAP membership",
  },
  {
    name: "Maharashtra State OTPT Council",
    shortName: "MSOTPTC",
    kind: "statutory_regulator",
    jurisdictionState: "MH",
    officialUrl: "https://www.msotptcouncil.com/",
    acceptedForBooking: true,
    publicLabel: "Maharashtra State OTPT Council registration",
  },
  {
    name: "Gujarat State Council for Physiotherapy",
    shortName: "GSCPT",
    kind: "statutory_regulator",
    jurisdictionState: "GJ",
    acceptedForBooking: true,
    publicLabel: "Gujarat State Council for Physiotherapy registration",
  },
  {
    name: "Karnataka State Allied and Healthcare Council",
    shortName: "KSAHC",
    kind: "statutory_regulator",
    jurisdictionState: "KA",
    acceptedForBooking: true,
    publicLabel: "Karnataka State Allied and Healthcare Council registration",
  },
  {
    name: "Tamil Nadu Allied and Healthcare Council",
    kind: "statutory_regulator",
    jurisdictionState: "TN",
    acceptedForBooking: true,
    publicLabel: "Tamil Nadu Allied and Healthcare Council registration",
  },
  {
    name: "Delhi Council for Physiotherapy and Occupational Therapy",
    shortName: "DCPTOT",
    kind: "statutory_regulator",
    jurisdictionState: "DL",
    acceptedForBooking: true,
    publicLabel: "Delhi Council for Physiotherapy and Occupational Therapy registration",
  },
  {
    name: "University degree (BPT / MPT)",
    kind: "degree_awarding",
    acceptedForBooking: false,
    publicLabel: "Degree reviewed",
  },
];

/** Proposed defaults from the SRS, stored as configuration (Specification status). */
export const PLATFORM_CONFIG: { key: string; value: unknown; description: string; srsRef: string }[] = [
  { key: "otp.ttl_seconds", value: 300, description: "OTP validity window", srsRef: "IAM-07" },
  { key: "otp.max_attempts", value: 5, description: "Failed OTP attempts before lockout", srsRef: "IAM-07" },
  { key: "otp.resend_cooldown_seconds", value: 60, description: "Minimum gap between OTP resends", srsRef: "IAM-07" },
  { key: "booking.hold_ttl_seconds", value: 300, description: "Slot hold duration before expiry", srsRef: "BKG-07" },
  { key: "booking.max_open_holds_per_account", value: 3, description: "Outstanding holds allowed per account", srsRef: "SEC-05" },
  { key: "booking.self_service_cutoff_hours", value: 12, description: "Patient cancel/reschedule cutoff before appointment", srsRef: "BKG-15" },
  { key: "booking.no_show_grace_minutes", value: 15, description: "Grace period before no-show can be recorded", srsRef: "BKG-01" },
  { key: "booking.idempotency_retention_hours", value: 24, description: "Idempotency record retention", srsRef: "BKG-10" },
  { key: "booking.minor_bookings_enabled", value: false, description: "Minor bookings disabled until guardian verification is implemented", srsRef: "BKG-16" },
  { key: "offering.default_duration_min", value: 30, description: "Default appointment duration", srsRef: "CAL-03" },
  { key: "offering.default_interval_min", value: 15, description: "Default slot start interval", srsRef: "CAL-03" },
  { key: "offering.default_buffer_before_min", value: 0, description: "Default before buffer", srsRef: "CAL-03" },
  { key: "offering.default_buffer_after_min", value: 10, description: "Default after buffer", srsRef: "CAL-03" },
  { key: "offering.default_min_notice_min", value: 120, description: "Default minimum notice", srsRef: "CAL-03" },
  { key: "offering.default_horizon_days", value: 60, description: "Default booking horizon", srsRef: "CAL-03" },
  { key: "offering.bounds", value: { durationMin: [10, 180], intervalMin: [5, 60], bufferMin: [0, 60], minNoticeMin: [0, 2880], horizonDays: [1, 180] }, description: "Admin bounds for provider offering values", srsRef: "CAL-03" },
  { key: "search.page_size_default", value: 20, description: "Default result cards per page", srsRef: "DIR-13" },
  { key: "search.page_size_max", value: 50, description: "Maximum result cards per page", srsRef: "DIR-13" },
  { key: "search.ranking_version", value: "rank-2026-10-v1", description: "Documented ranking version", srsRef: "DIR-12" },
  { key: "slots.max_query_days", value: 31, description: "Maximum slot query window", srsRef: "API-04" },
  { key: "reminders.offsets_minutes", value: [1440, 120], description: "Reminder offsets before appointment", srsRef: "Section 13" },
  { key: "reviews.invite_delay_minutes", value: 120, description: "Review invitation delay after completion", srsRef: "Section 13" },
  { key: "reviews.text_min_chars", value: 20, description: "Minimum review text length", srsRef: "REV-02" },
  { key: "reviews.text_max_chars", value: 2000, description: "Maximum review text length", srsRef: "REV-02" },
  { key: "credentials.renewal_reminder_days", value: [30, 7, 1], description: "Renewal reminders before credential expiry", srsRef: "VER-05" },
  { key: "admin.first_response_target_business_days", value: 2, description: "Queue first-response target", srsRef: "ADM-02" },
  { key: "admin.privileged_idle_timeout_minutes", value: 30, description: "Privileged session idle timeout", srsRef: "SEC-02" },
  { key: "uploads.public_image_max_bytes", value: 5 * 1024 * 1024, description: "Public image size limit", srsRef: "SEC-04" },
  { key: "uploads.private_doc_max_bytes", value: 10 * 1024 * 1024, description: "Private document size limit", srsRef: "SEC-04" },
  { key: "uploads.signed_url_ttl_seconds", value: 300, description: "Signed URL lifetime for private documents", srsRef: "SEC-04" },
  { key: "exports.ttl_hours", value: 24, description: "Export download window", srsRef: "SEC-09" },
  { key: "retention.booking_months", value: 24, description: "Booking record retention after last appointment", srsRef: "SEC-09" },
  { key: "retention.draft_days", value: 90, description: "Unused registration draft retention", srsRef: "SEC-09" },
  { key: "retention.credential_evidence_after_closure_days", value: 90, description: "Credential evidence retention after listing closure", srsRef: "SEC-09" },
  { key: "platform.timezone", value: "Asia/Kolkata", description: "Default display timezone", srsRef: "Section 2" },
  { key: "platform.currency", value: "INR", description: "Platform currency", srsRef: "Section 2" },
  { key: "platform.fee_model", value: "none", description: "No listing fee or commission in MVP", srsRef: "Section 30" },
];

export const FEATURE_FLAGS: { key: string; enabled: boolean; description: string; owner: string }[] = [
  { key: "payments.online", enabled: false, description: "Online payment collection (R2)", owner: "product" },
  { key: "booking.request_mode", enabled: false, description: "Request-to-book mode (R1)", owner: "product" },
  { key: "service_mode.home_visit", enabled: false, description: "Home visit offerings (R1)", owner: "product" },
  { key: "service_mode.online", enabled: false, description: "Online consultation offerings (R1)", owner: "product" },
  { key: "calendar.external_sync", enabled: false, description: "External calendar busy sync (R1)", owner: "engineering" },
  { key: "messaging.whatsapp", enabled: false, description: "WhatsApp channel", owner: "operations" },
  { key: "booking.minors", enabled: false, description: "Minor bookings via verified guardian flow", owner: "privacy" },
  { key: "search.radius", enabled: false, description: "Near-me radius filtering (requires coordinates)", owner: "engineering" },
];

export const POLICIES: {
  type: "cancellation" | "provider_terms" | "patient_terms" | "privacy_notice" | "jurisdiction" | "ranking" | "offer_terms";
  key: string;
  version: string;
  title: string;
  stateCode?: string;
  content: Record<string, unknown>;
  bodyMarkdown?: string;
}[] = [
  {
    type: "cancellation",
    key: "default",
    version: "cancel-2026-10",
    title: "Standard cancellation and rescheduling policy",
    content: { selfServiceCutoffHours: 12, platformPenalty: false, afterCutoff: "request_to_clinic" },
    bodyMarkdown:
      "You can cancel or reschedule online up to 12 hours before your appointment. After that, you can send a cancellation request to the clinic. The platform does not charge a cancellation fee.",
  },
  {
    type: "provider_terms",
    key: "default",
    version: "provider-2026-10",
    title: "Provider terms (draft for counsel review)",
    content: { status: "draft", requiresCounselReview: true },
    bodyMarkdown: "Draft provider terms. Must be validated with qualified Indian counsel before publication (Section 26).",
  },
  {
    type: "patient_terms",
    key: "default",
    version: "patient-2026-10",
    title: "Patient terms (draft for counsel review)",
    content: { status: "draft", requiresCounselReview: true },
  },
  {
    type: "privacy_notice",
    key: "default",
    version: "privacy-2026-10",
    title: "Privacy notice (draft for counsel review)",
    content: { status: "draft", framework: "DPDP Act 2023 and Rules 2025", requiresCounselReview: true },
  },
  {
    type: "ranking",
    key: "default",
    version: "rank-2026-10-v1",
    title: "Default search ranking",
    content: {
      order: ["match_relevance", "location_match", "bookable_availability", "public_id"],
      sponsoredPositions: false,
      note: "Discounts and advertising do not change organic relevance (DIR-12).",
    },
  },
  {
    type: "jurisdiction",
    key: "national-default",
    version: "juris-2026-10",
    title: "National default jurisdiction policy",
    content: {
      bookingEnabled: false,
      acceptedCredentialKinds: ["statutory_regulator", "enrolment_body"],
      exceptionAllowed: true,
      note: "Bookability is activated per state only after operations validates the policy (VER-03, Section 30).",
    },
  },
];

export const NOTIFICATION_TEMPLATES: {
  eventType: string;
  channel: "in_app" | "sms" | "email" | "whatsapp";
  subject?: string;
  body: string;
}[] = [
  {
    eventType: "booking.confirmed",
    channel: "sms",
    body: "Your physiotherapy appointment {{reference}} is confirmed for {{localDateTime}} at {{clinicName}}, {{locality}}. Manage: {{manageUrl}} - The Physio Index",
  },
  {
    eventType: "booking.confirmed",
    channel: "email",
    subject: "Appointment confirmed: {{reference}}",
    body: "Your appointment with {{practitionerName}} is confirmed for {{localDateTime}} at {{clinicName}}.\n\nAddress: {{address}}\nFee: {{amount}} (pay at clinic)\nCancellation policy: {{policySummary}}\n\nManage your appointment: {{manageUrl}}",
  },
  {
    eventType: "booking.confirmed.practitioner",
    channel: "in_app",
    body: "New appointment {{reference}} on {{localDateTime}} at {{branchName}}.",
  },
  {
    eventType: "booking.cancelled",
    channel: "sms",
    body: "Appointment {{reference}} on {{localDateTime}} has been cancelled. Rebook: {{rebookUrl}} - The Physio Index",
  },
  {
    eventType: "booking.rescheduled",
    channel: "sms",
    body: "Appointment {{reference}} is now on {{localDateTime}} at {{clinicName}}. Manage: {{manageUrl}} - The Physio Index",
  },
  {
    eventType: "booking.reminder",
    channel: "sms",
    body: "Reminder: your physiotherapy appointment {{reference}} is on {{localDateTime}} at {{clinicName}}, {{locality}}. Manage: {{manageUrl}}",
  },
  {
    eventType: "verification.decided",
    channel: "email",
    subject: "Update on your The Physio Index listing",
    body: "Decision: {{decision}}\nReason: {{reason}}\nNext step: {{nextAction}}",
  },
  {
    eventType: "review.invitation",
    channel: "sms",
    body: "How was your appointment {{reference}}? Share a review (2 min): {{reviewUrl}} - The Physio Index",
  },
];
