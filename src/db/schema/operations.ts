import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, occurredAt, timestamps } from "./_common";
import {
  caseDecision,
  caseState,
  caseType,
  channel,
  consentAction,
  consentPurpose,
  consentSubject,
  deliveryState,
  exportState,
  mediaPurpose,
  moderationState,
  offerScope,
  offerState,
  offerType,
  outboxState,
  policyType,
  priority,
  privacyRequestState,
  privacyRequestType,
  redemptionState,
  reviewState,
  scanState,
  supportState,
  visibility,
} from "./enums";
import { clinics } from "./clinics";
import { cities, states } from "./geography";
import { patients, users } from "./identity";
import { practitioners } from "./practitioners";
import { bookings, reservations } from "./scheduling";

// ---------------- Offers (Section 14) ----------------

export const offers = pgTable(
  "offers",
  {
    id: id(),
    scopeType: offerScope("scope_type").notNull(),
    practitionerId: uuid("practitioner_id").references(() => practitioners.id),
    clinicId: uuid("clinic_id").references(() => clinics.id),
    code: text("code"),
    title: text("title").notNull(),
    state: offerState("state").notNull().default("draft"),
    currentVersionId: uuid("current_version_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("offers_code_uq").on(sql`upper(${t.code})`).where(sql`${t.code} IS NOT NULL`),
    index("offers_practitioner_idx").on(t.practitionerId, t.state),
    check("offers_scope_ref", sql`(${t.scopeType} = 'practitioner' AND ${t.practitionerId} IS NOT NULL) OR (${t.scopeType} = 'clinic' AND ${t.clinicId} IS NOT NULL)`),
  ],
);

export const offerVersions = pgTable(
  "offer_versions",
  {
    id: id(),
    offerId: uuid("offer_id").notNull().references(() => offers.id),
    version: integer("version").notNull(),
    type: offerType("type").notNull(),
    /** Fixed: paise. Percentage: basis points (1250 = 12.50 %). */
    value: integer("value").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    eligibleOfferingIds: uuid("eligible_offering_ids").array(), // null = all offerings in scope
    minSpendPaise: bigint("min_spend_paise", { mode: "number" }).notNull().default(0),
    maxDiscountPaise: bigint("max_discount_paise", { mode: "number" }),
    totalCap: integer("total_cap"),
    perPatientCap: integer("per_patient_cap").notNull().default(1),
    firstVisitOnly: boolean("first_visit_only").notNull().default(false),
    automatic: boolean("automatic").notNull().default(true), // applied without a code when eligible
    terms: text("terms").notNull(),
    regularPriceConfirmed: boolean("regular_price_confirmed").notNull().default(false),
    moderationState: moderationState("moderation_state").notNull().default("pending"),
    moderatedByUserId: uuid("moderated_by_user_id").references(() => users.id),
    moderationReason: text("moderation_reason"),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("offer_versions_offer_version_uq").on(t.offerId, t.version),
    check("offer_versions_validity", sql`${t.endsAt} > ${t.startsAt}`),
    check("offer_versions_value", sql`${t.value} > 0 AND (${t.type} <> 'percentage' OR ${t.value} <= 10000)`),
    check("offer_versions_caps", sql`(${t.totalCap} IS NULL OR ${t.totalCap} > 0) AND ${t.perPatientCap} > 0`),
  ],
);

/** Reserved on hold, consumed on confirmation, released/restored otherwise (OFR-05). */
export const offerRedemptions = pgTable(
  "offer_redemptions",
  {
    id: id(),
    offerVersionId: uuid("offer_version_id").notNull().references(() => offerVersions.id),
    offerId: uuid("offer_id").notNull().references(() => offers.id),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    reservationId: uuid("reservation_id").notNull().references(() => reservations.id),
    bookingId: uuid("booking_id").references(() => bookings.id),
    state: redemptionState("state").notNull().default("reserved"),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("offer_redemptions_reservation_uq").on(t.reservationId),
    index("offer_redemptions_offer_patient_idx").on(t.offerId, t.patientId, t.state),
    index("offer_redemptions_version_state_idx").on(t.offerVersionId, t.state),
  ],
);

/** Every counter change is recorded (OFR-05). */
export const offerCounterEvents = pgTable(
  "offer_counter_events",
  {
    id: id(),
    offerVersionId: uuid("offer_version_id").notNull().references(() => offerVersions.id),
    redemptionId: uuid("redemption_id").references(() => offerRedemptions.id),
    delta: smallint("delta").notNull(),
    reason: text("reason").notNull(),
    occurredAt: occurredAt(),
  },
  (t) => [index("offer_counter_events_version_idx").on(t.offerVersionId, t.occurredAt)],
);

// ---------------- Reviews (Section 17) ----------------

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    rating: smallint("rating").notNull(),
    text: text("text"),
    displayName: text("display_name").notNull(),
    state: reviewState("state").notNull().default("pending"),
    moderationReason: text("moderation_reason"),
    moderatedByUserId: uuid("moderated_by_user_id").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("reviews_booking_uq").on(t.bookingId),
    index("reviews_practitioner_state_idx").on(t.practitionerId, t.state),
    check("reviews_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
    check("reviews_text_len", sql`${t.text} IS NULL OR char_length(${t.text}) BETWEEN 20 AND 2000`),
  ],
);

export const reviewReplies = pgTable(
  "review_replies",
  {
    id: id(),
    reviewId: uuid("review_id").notNull().references(() => reviews.id),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id),
    version: integer("version").notNull().default(1),
    text: text("text").notNull(),
    state: moderationState("state").notNull().default("pending"),
    moderationReason: text("moderation_reason"),
    ...timestamps,
  },
  (t) => [uniqueIndex("review_replies_review_version_uq").on(t.reviewId, t.version), check("review_replies_len", sql`char_length(${t.text}) <= 1000`)],
);

// ---------------- Media (DAT-04, SEC-04) ----------------

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    objectKey: text("object_key").notNull(),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
    practitionerId: uuid("practitioner_id").references(() => practitioners.id),
    purpose: mediaPurpose("purpose").notNull(),
    visibility: visibility("visibility").notNull().default("private"),
    mime: text("mime").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    checksumSha256: text("checksum_sha256"),
    width: integer("width"),
    height: integer("height"),
    altText: text("alt_text"),
    scanState: scanState("scan_state").notNull().default("quarantined"),
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    ownershipConfirmedAt: timestamp("ownership_confirmed_at", { withTimezone: true }),
    moderationState: moderationState("moderation_state").notNull().default("pending"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("media_assets_object_key_uq").on(t.objectKey),
    index("media_assets_owner_idx").on(t.ownerUserId, t.purpose),
    check("media_assets_bytes_pos", sql`${t.bytes} > 0`),
    // Certificates and identity documents are never public (PRO-12).
    check("media_assets_private_purposes", sql`${t.visibility} = 'private' OR ${t.purpose} IN ('profile_photo', 'portfolio', 'clinic_photo')`),
  ],
);

// ---------------- Review queues and cases (ADM-02, ADM-07) ----------------

export const verificationCases = pgTable(
  "verification_cases",
  {
    id: id(),
    caseType: caseType("case_type").notNull(),
    subjectType: text("subject_type").notNull(), // practitioner | profile_version | credential | claim_request | offer_version | review | branch | locality_proposal | ...
    subjectId: uuid("subject_id").notNull(),
    practitionerId: uuid("practitioner_id").references(() => practitioners.id),
    state: caseState("state").notNull().default("open"),
    priority: priority("priority").notNull().default("normal"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id),
    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    decision: caseDecision("decision"),
    decisionReason: text("decision_reason"),
    method: text("method"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    secondApproverUserId: uuid("second_approver_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("verification_cases_queue_idx").on(t.caseType, t.state, t.submittedAt),
    index("verification_cases_subject_idx").on(t.subjectType, t.subjectId),
    index("verification_cases_assignee_idx").on(t.assigneeUserId, t.state),
    index("verification_cases_practitioner_idx").on(t.practitionerId),
  ],
);

export const caseEvents = pgTable(
  "case_events",
  {
    id: id(),
    caseId: uuid("case_id").notNull().references(() => verificationCases.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: occurredAt(),
  },
  (t) => [index("case_events_case_idx").on(t.caseId, t.occurredAt)],
);

export const supportCases = pgTable(
  "support_cases",
  {
    id: id(),
    reference: text("reference").notNull(),
    requesterUserId: uuid("requester_user_id").references(() => users.id),
    requesterContact: text("requester_contact"),
    category: text("category").notNull(),
    linkedType: text("linked_type"), // practitioner | booking | review | clinic
    linkedId: uuid("linked_id"),
    priority: priority("priority").notNull().default("normal"),
    state: supportState("state").notNull().default("open"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id),
    description: text("description").notNull(),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("support_cases_reference_uq").on(t.reference), index("support_cases_state_idx").on(t.state, t.priority, t.createdAt)],
);

export const supportCaseEvents = pgTable(
  "support_case_events",
  {
    id: id(),
    caseId: uuid("case_id").notNull().references(() => supportCases.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: occurredAt(),
  },
  (t) => [index("support_case_events_case_idx").on(t.caseId, t.occurredAt)],
);

/** Time-limited, case-scoped support access grants (IAM-04). */
export const supportAccessGrants = pgTable(
  "support_access_grants",
  {
    id: id(),
    caseId: uuid("case_id").notNull().references(() => supportCases.id),
    agentUserId: uuid("agent_user_id").notNull().references(() => users.id),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    authorisedBy: text("authorised_by").notNull(), // patient | practitioner | admin
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("support_access_grants_agent_idx").on(t.agentUserId, t.expiresAt)],
);

// ---------------- Consent, privacy, audit (Section 26) ----------------

export const consentRecords = pgTable(
  "consent_records",
  {
    id: id(),
    subjectType: consentSubject("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    purpose: consentPurpose("purpose").notNull(),
    noticeVersion: text("notice_version").notNull(),
    action: consentAction("action").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull(), // web | staff | import
    proofRef: text("proof_ref"),
    actorUserId: uuid("actor_user_id").references(() => users.id),
  },
  (t) => [index("consent_records_subject_idx").on(t.subjectType, t.subjectId, t.purpose, t.capturedAt)],
);

export const privacyRequests = pgTable(
  "privacy_requests",
  {
    id: id(),
    requesterUserId: uuid("requester_user_id").references(() => users.id),
    requesterContact: text("requester_contact"),
    requestType: privacyRequestType("request_type").notNull(),
    subjectType: text("subject_type"),
    subjectId: uuid("subject_id"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    state: privacyRequestState("state").notNull().default("received"),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id),
    details: text("details"),
    resolution: text("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("privacy_requests_state_idx").on(t.state, t.dueAt)],
);

/** Append-only audit trail; secret and sensitive values are redacted before insert (Section 22). */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    actorUserId: uuid("actor_user_id"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    objectType: text("object_type").notNull(),
    objectId: uuid("object_id"),
    reason: text("reason"),
    changedFields: jsonb("changed_fields").$type<Record<string, unknown>>(),
    correlationId: text("correlation_id"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    occurredAt: occurredAt(),
  },
  (t) => [
    index("audit_events_object_idx").on(t.objectType, t.objectId, t.occurredAt),
    index("audit_events_actor_idx").on(t.actorUserId, t.occurredAt),
  ],
);

/** Access history for sensitive records (PRO-16, ADM-04). */
export const recordAccessLog = pgTable(
  "record_access_log",
  {
    id: id(),
    actorUserId: uuid("actor_user_id").notNull(),
    objectType: text("object_type").notNull(),
    objectId: uuid("object_id").notNull(),
    purpose: text("purpose"),
    occurredAt: occurredAt(),
  },
  (t) => [index("record_access_log_object_idx").on(t.objectType, t.objectId, t.occurredAt)],
);

// ---------------- Outbox and messaging (DAT-03, MSG-01, MSG-02) ----------------

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: id(),
    eventId: uuid("event_id").notNull().default(sql`gen_random_uuid()`),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    aggregateVersion: bigint("aggregate_version", { mode: "number" }).notNull().default(1),
    eventType: text("event_type").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    correlationId: text("correlation_id"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    state: outboxState("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
    occurredAt: occurredAt(),
  },
  (t) => [
    uniqueIndex("outbox_events_event_id_uq").on(t.eventId),
    index("outbox_events_pending_idx").on(t.availableAt).where(sql`${t.state} IN ('pending', 'failed')`),
    index("outbox_events_aggregate_idx").on(t.aggregateType, t.aggregateId),
  ],
);

/** Consumers record processed event IDs (API-09). */
export const processedEvents = pgTable(
  "processed_events",
  {
    consumer: text("consumer").notNull(),
    eventId: uuid("event_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.consumer, t.eventId] })],
);

export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: id(),
    eventType: text("event_type").notNull(),
    channel: channel("channel").notNull(),
    language: text("language").notNull().default("en"),
    version: integer("version").notNull().default(1),
    subject: text("subject"),
    body: text("body").notNull(),
    active: boolean("active").notNull().default(true),
    providerTemplateId: text("provider_template_id"), // e.g. MSG91 DLT template id
    ...timestamps,
  },
  (t) => [uniqueIndex("notification_templates_uq").on(t.eventType, t.channel, t.language, t.version)],
);

export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: id(),
    eventId: uuid("event_id").notNull(),
    bookingId: uuid("booking_id").references(() => bookings.id),
    recipientType: text("recipient_type").notNull(), // user | patient | practitioner
    recipientId: uuid("recipient_id").notNull(),
    channel: channel("channel").notNull(),
    templateId: uuid("template_id").references(() => notificationTemplates.id),
    dedupeKey: text("dedupe_key").notNull(),
    state: deliveryState("state").notNull().default("queued"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
    aggregateVersion: bigint("aggregate_version", { mode: "number" }),
    providerRef: text("provider_ref"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("notification_deliveries_dedupe_uq").on(t.dedupeKey),
    index("notification_deliveries_due_idx").on(t.scheduledFor).where(sql`${t.state} IN ('queued', 'failed')`),
    index("notification_deliveries_booking_idx").on(t.bookingId),
  ],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  transactionalSms: boolean("transactional_sms").notNull().default(true),
  transactionalEmail: boolean("transactional_email").notNull().default(true),
  whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(false),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  preferredLanguage: text("preferred_language").notNull().default("en"),
  ...timestamps,
});

// ---------------- Policies, configuration, flags (Section 2, 22, 28) ----------------

/** Versioned provider and platform rules (cancellation, terms, jurisdiction, ranking). */
export const policies = pgTable(
  "policies",
  {
    id: id(),
    type: policyType("type").notNull(),
    key: text("key").notNull(),
    version: text("version").notNull(),
    title: text("title").notNull(),
    scopeType: text("scope_type").notNull().default("global"),
    scopeId: uuid("scope_id"),
    stateId: uuid("state_id").references(() => states.id), // jurisdiction policies
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    bodyMarkdown: text("body_markdown"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("policies_type_key_version_uq").on(t.type, t.key, t.version), index("policies_effective_idx").on(t.type, t.key, t.effectiveAt)],
);

/** Proposed defaults from the SRS live here, not in code (Specification status). */
export const platformConfig = pgTable("platform_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  description: text("description").notNull(),
  srsRef: text("srs_ref"),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
  ...timestamps,
});

export const configHistory = pgTable(
  "config_history",
  {
    id: id(),
    key: text("key").notNull(),
    previousValue: jsonb("previous_value").$type<unknown>(),
    newValue: jsonb("new_value").$type<unknown>().notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    reason: text("reason"),
    occurredAt: occurredAt(),
  },
  (t) => [index("config_history_key_idx").on(t.key, t.occurredAt)],
);

/** Feature flags with owners and audit history (OPS-03). */
export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  description: text("description").notNull(),
  owner: text("owner"),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
  ...timestamps,
});

export const featureFlagEvents = pgTable(
  "feature_flag_events",
  {
    id: id(),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    reason: text("reason"),
    occurredAt: occurredAt(),
  },
  (t) => [index("feature_flag_events_key_idx").on(t.key, t.occurredAt)],
);

/** Scoped, purpose-bound, expiring exports (PRO-17). */
export const exportJobs = pgTable(
  "export_jobs",
  {
    id: id(),
    requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    scope: jsonb("scope").$type<Record<string, unknown>>().notNull(),
    purpose: text("purpose").notNull(),
    state: exportState("state").notNull().default("requested"),
    assetId: uuid("asset_id").references(() => mediaAssets.id),
    rowCount: integer("row_count"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("export_jobs_requester_idx").on(t.requestedByUserId, t.createdAt)],
);

// ---------------- Analytics (DAT-17) — separate schema, pseudonymous ----------------

export const analyticsSchema = pgSchema("analytics");

export const analyticsEvents = analyticsSchema.table(
  "events",
  {
    id: id(),
    eventType: text("event_type").notNull(), // search | profile_view | booking_start | hold | confirmation | cancellation
    occurredAt: occurredAt(),
    pseudonymousId: text("pseudonymous_id"),
    sessionId: text("session_id"),
    practitionerId: uuid("practitioner_id"),
    cityId: uuid("city_id").references(() => cities.id),
    stateId: uuid("state_id").references(() => states.id),
    source: text("source"),
    properties: jsonb("properties").$type<Record<string, unknown>>(),
  },
  (t) => [index("analytics_events_type_time_idx").on(t.eventType, t.occurredAt), index("analytics_events_practitioner_idx").on(t.practitionerId, t.occurredAt)],
);

export const analyticsDailyFacts = analyticsSchema.table(
  "daily_facts",
  {
    day: text("day").notNull(), // YYYY-MM-DD in Asia/Kolkata
    stateId: uuid("state_id"),
    cityId: uuid("city_id"),
    practitionerId: uuid("practitioner_id"),
    source: text("source"),
    metric: text("metric").notNull(),
    value: bigint("value", { mode: "number" }).notNull().default(0),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("analytics_daily_facts_uq").on(
      t.day,
      t.metric,
      sql`coalesce(${t.stateId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`coalesce(${t.cityId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`coalesce(${t.practitionerId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`coalesce(${t.source}, '')`,
    ),
  ],
);
