import { pgEnum } from "drizzle-orm/pg-core";

// ---- Identity (Section 3, 5) ----
export const userStatus = pgEnum("user_status", ["active", "suspended", "closed"]);
export const roleName = pgEnum("role_name", [
  "patient",
  "practitioner",
  "clinic_coordinator",
  "clinic_manager",
  "clinic_owner",
  "verification_reviewer",
  "support_agent",
  "analyst",
  "super_admin",
]);
export const scopeType = pgEnum("scope_type", ["global", "practitioner", "clinic", "branch", "case"]);
export const invitationState = pgEnum("invitation_state", ["pending", "accepted", "expired", "revoked"]);
export const patientStatus = pgEnum("patient_status", ["active", "merged", "closed"]);
export const ageBand = pgEnum("age_band", ["minor", "adult", "senior"]);
export const guardianVerification = pgEnum("guardian_verification_state", [
  "self_declared",
  "verified",
  "revoked",
]);

// ---- Directory / geography (Section 9) ----
export const stateKind = pgEnum("state_kind", ["state", "union_territory"]);
export const geoStatus = pgEnum("geo_status", ["active", "inactive", "merged", "proposed"]);
export const geoTargetType = pgEnum("geo_target_type", ["state", "district", "city", "locality"]);
export const aliasKind = pgEnum("alias_kind", [
  "spelling",
  "former_name",
  "abbreviation",
  "local_language",
  "colloquial",
]);
export const proposalState = pgEnum("proposal_state", ["pending", "approved", "rejected", "merged"]);

// ---- Practitioners and credentials (Sections 5-7) ----
export const listingStatus = pgEnum("listing_status", [
  "draft",
  "submitted",
  "changes_requested",
  "published",
  "rejected",
  "suspended",
  "archived",
]);
export const claimState = pgEnum("claim_state", ["unclaimed", "claimed"]);
export const practitionerSource = pgEnum("practitioner_source", ["self_created", "imported", "staff_created"]);
export const profileVersionState = pgEnum("profile_version_state", [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "superseded",
]);
export const genderPref = pgEnum("gender_pref", ["female", "male", "non_binary", "unset"]);
export const credentialType = pgEnum("credential_type", [
  "statutory_registration",
  "enrolment",
  "degree",
  "association_membership",
  "certification",
]);
export const credentialStatus = pgEnum("credential_status", [
  "self_declared",
  "pending",
  "document_reviewed",
  "registration_checked",
  "unverifiable",
  "expired",
  "suspended",
  "revoked",
]);
export const authorityKind = pgEnum("authority_kind", [
  "statutory_regulator",
  "enrolment_body",
  "degree_awarding",
  "professional_association",
  "other",
]);
export const claimRequestState = pgEnum("claim_request_state", [
  "requested",
  "evidence_requested",
  "under_review",
  "approved",
  "rejected",
  "withdrawn",
]);
export const portfolioKind = pgEnum("portfolio_kind", [
  "award",
  "certification",
  "membership",
  "publication",
  "website",
  "social",
]);
export const importBatchState = pgEnum("import_batch_state", [
  "staged",
  "validated",
  "published",
  "reverted",
  "failed",
]);
export const importRowState = pgEnum("import_row_state", ["pending", "valid", "invalid", "duplicate", "published", "skipped"]);

// ---- Clinics and offerings (Section 8) ----
export const clinicStatus = pgEnum("clinic_status", ["draft", "published", "suspended", "archived"]);
export const branchStatus = pgEnum("branch_status", ["draft", "published", "suspended", "archived"]);
export const associationState = pgEnum("association_state", ["pending", "approved", "rejected", "ended"]);
export const serviceKind = pgEnum("service_kind", ["initial_assessment", "follow_up", "procedure", "package", "other"]);
export const serviceMode = pgEnum("service_mode", ["clinic", "home_visit", "online"]);
export const bookingMode = pgEnum("booking_mode", ["instant", "request"]);

// ---- Scheduling and bookings (Sections 10-12) ----
export const exceptionKind = pgEnum("exception_kind", [
  "leave",
  "manual_block",
  "date_override",
  "extra_hours",
  "external_busy",
]);
export const reservationState = pgEnum("reservation_state", ["held", "committed", "released", "expired"]);
export const bookingStatus = pgEnum("booking_status", [
  "confirmed",
  "completed",
  "patient_cancelled",
  "provider_cancelled",
  "no_show",
  "requested",
  "declined",
  "expired",
]);
export const bookingSource = pgEnum("booking_source", ["platform", "phone", "walk_in", "staff"]);
export const paymentMode = pgEnum("payment_mode", ["pay_at_clinic", "online"]);
export const paymentReported = pgEnum("payment_reported_state", ["not_reported", "reported_received"]);
export const idempotencyState = pgEnum("idempotency_state", ["in_progress", "completed", "failed"]);
export const taskKind = pgEnum("resolution_task_kind", [
  "future_booking_after_suspension",
  "association_ended",
  "schedule_reduced",
  "leave_conflict",
  "cancellation_request_after_cutoff",
  "credential_expired",
  "account_closure",
  "other",
]);
export const taskState = pgEnum("resolution_task_state", ["open", "in_progress", "resolved", "dismissed"]);

// ---- Offers, reviews, media, cases (Sections 14, 16, 17) ----
export const offerScope = pgEnum("offer_scope", ["practitioner", "clinic"]);
export const offerState = pgEnum("offer_state", [
  "draft",
  "submitted",
  "approved",
  "active",
  "paused",
  "expired",
  "rejected",
  "suspended",
]);
export const offerType = pgEnum("offer_type", ["fixed", "percentage"]);
export const moderationState = pgEnum("moderation_state", ["pending", "approved", "rejected", "appealed"]);
export const redemptionState = pgEnum("redemption_state", ["reserved", "consumed", "released", "restored"]);
export const reviewState = pgEnum("review_state", ["pending", "published", "rejected", "appealed", "withdrawn"]);
export const mediaPurpose = pgEnum("media_purpose", [
  "profile_photo",
  "portfolio",
  "clinic_photo",
  "credential_evidence",
  "identity_proof",
  "claim_evidence",
  "case_attachment",
  "export",
]);
export const scanState = pgEnum("scan_state", ["quarantined", "clean", "infected", "failed"]);
export const visibility = pgEnum("visibility", ["public", "private"]);
export const caseType = pgEnum("case_type", [
  "listing_review",
  "profile_change",
  "claim",
  "credential_check",
  "duplicate_candidate",
  "offer_review",
  "review_moderation",
  "complaint",
  "correction_request",
  "locality_proposal",
  "credential_fraud",
  "ownership_transfer",
  "role_escalation",
]);
export const caseState = pgEnum("case_state", ["open", "in_review", "awaiting_evidence", "decided", "closed"]);
export const caseDecision = pgEnum("case_decision", [
  "approved",
  "rejected",
  "changes_requested",
  "suspended",
  "reinstated",
  "dismissed",
  "merged",
]);
export const priority = pgEnum("priority", ["low", "normal", "high", "urgent"]);
export const supportState = pgEnum("support_state", ["open", "in_progress", "waiting_on_requester", "resolved", "closed"]);
export const consentSubject = pgEnum("consent_subject", ["user", "patient", "practitioner", "clinic"]);
export const consentPurpose = pgEnum("consent_purpose", [
  "account_operation",
  "profile_publication",
  "dependant_booking",
  "guardian_authority",
  "marketing",
  "provider_terms",
  "patient_terms",
  "privacy_notice",
  "media_ownership",
  "location_access",
]);
export const consentAction = pgEnum("consent_action", ["granted", "withdrawn"]);
export const privacyRequestType = pgEnum("privacy_request_type", ["access", "correction", "erasure", "grievance"]);
export const privacyRequestState = pgEnum("privacy_request_state", [
  "received",
  "verified",
  "in_progress",
  "completed",
  "rejected",
]);

// ---- Messaging, outbox, policies (Sections 13, 18, 25) ----
export const outboxState = pgEnum("outbox_state", ["pending", "claimed", "delivered", "failed", "dead"]);
export const channel = pgEnum("channel", ["in_app", "sms", "email", "whatsapp"]);
export const deliveryState = pgEnum("delivery_state", ["queued", "sent", "delivered", "failed", "dead", "cancelled"]);
export const policyType = pgEnum("policy_type", [
  "cancellation",
  "provider_terms",
  "patient_terms",
  "privacy_notice",
  "jurisdiction",
  "ranking",
  "offer_terms",
]);
export const exportState = pgEnum("export_state", ["requested", "running", "ready", "expired", "failed"]);
