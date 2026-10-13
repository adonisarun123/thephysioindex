import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import {
  authorityKind,
  claimRequestState,
  claimState,
  credentialStatus,
  credentialType,
  genderPref,
  importBatchState,
  importRowState,
  listingStatus,
  portfolioKind,
  practitionerSource,
  profileVersionState,
} from "./enums";
import { languages, specialties, states } from "./geography";
import { users } from "./identity";

/** tsvector column maintained by trigger (see SQL migration). */
export const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

/** Bulk import staging (PRO-07, ADM-06). Rows never become verified or claimed by import alone. */
export const importBatches = pgTable("import_batches", {
  id: id(),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url"),
  collectedOn: date("collected_on").notNull(),
  permittedUseBasis: text("permitted_use_basis").notNull(),
  state: importBatchState("state").notNull().default("staged"),
  rowCount: integer("row_count").notNull().default(0),
  summary: jsonb("summary").$type<Record<string, unknown>>(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  ...timestamps,
});

/**
 * One canonical professional identity (Section 20). Public ID and slug are
 * stable across renames (DIR-06). Owner is null for unclaimed listings.
 */
export const practitioners = pgTable(
  "practitioners",
  {
    id: id(),
    publicId: text("public_id").notNull(),
    slug: text("slug").notNull(),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
    claimState: claimState("claim_state").notNull().default("unclaimed"),
    listingStatus: listingStatus("listing_status").notNull().default("draft"),
    bookingEligible: boolean("booking_eligible").notNull().default(false),
    bookingPaused: boolean("booking_paused").notNull().default(false),
    publishedVersionId: uuid("published_version_id"),
    source: practitionerSource("source").notNull().default("self_created"),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id),
    // Denormalised identity fields for cards/search; the approved field set lives in profile_versions.
    displayName: text("display_name").notNull(),
    designation: text("designation"),
    headline: text("headline"),
    gender: genderPref("gender").notNull().default("unset"),
    practiceStartDate: date("practice_start_date"),
    photoAssetId: uuid("photo_asset_id"),
    searchVector: tsvector("search_vector"),
    reviewCount: integer("review_count").notNull().default(0),
    ratingAvgX100: integer("rating_avg_x100"), // integer average * 100; recalculated from published reviews only
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspensionReason: text("suspension_reason"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    isTestAccount: boolean("is_test_account").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("practitioners_public_id_uq").on(t.publicId),
    index("practitioners_slug_idx").on(t.slug),
    index("practitioners_owner_idx").on(t.ownerUserId),
    index("practitioners_listing_status_idx").on(t.listingStatus),
    index("practitioners_name_trgm_idx").using("gin", sql`lower(${t.displayName}) gin_trgm_ops`),
    index("practitioners_search_vector_idx").using("gin", t.searchVector),
    check("practitioners_name_len", sql`char_length(${t.displayName}) BETWEEN 2 AND 120`),
    check("practitioners_headline_len", sql`${t.headline} IS NULL OR char_length(${t.headline}) <= 160`),
  ],
);

/** Old practitioner slugs retained as redirects after renames (DIR-06, SEO-05). */
export const practitionerSlugHistory = pgTable(
  "practitioner_slug_history",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    slug: text("slug").notNull(),
    ...timestamps,
  },
  (t) => [index("practitioner_slug_history_slug_idx").on(t.slug)],
);

/** Draft vs published separation with full version history (PRO-10). */
export const profileVersions = pgTable(
  "profile_versions",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    version: integer("version").notNull(),
    state: profileVersionState("state").notNull().default("draft"),
    structuredContent: jsonb("structured_content").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    changedFields: text("changed_fields").array(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    decisionReason: text("decision_reason"),
    caseId: uuid("case_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("profile_versions_practitioner_version_uq").on(t.practitionerId, t.version),
    index("profile_versions_state_idx").on(t.state, t.submittedAt),
  ],
);

export const qualifications = pgTable(
  "qualifications",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    degree: text("degree").notNull(),
    institution: text("institution").notNull(),
    completionYear: smallint("completion_year"),
    inProgress: boolean("in_progress").notNull().default(false),
    evidenceAssetId: uuid("evidence_asset_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("qualifications_practitioner_idx").on(t.practitionerId),
    check("qualifications_year_range", sql`${t.completionYear} IS NULL OR ${t.completionYear} BETWEEN 1950 AND 2100`),
  ],
);

export const experiences = pgTable(
  "experiences",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    role: text("role").notNull(),
    organisationName: text("organisation_name").notNull(),
    startMonth: date("start_month").notNull(),
    endMonth: date("end_month"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("experiences_practitioner_idx").on(t.practitionerId),
    check("experiences_dates_ordered", sql`${t.endMonth} IS NULL OR ${t.endMonth} >= ${t.startMonth}`),
  ],
);

/** Statutory regulator, enrolment body, degree awarder or association (VER-01). */
export const credentialAuthorities = pgTable(
  "credential_authorities",
  {
    id: id(),
    name: text("name").notNull(),
    shortName: text("short_name"),
    kind: authorityKind("kind").notNull(),
    jurisdictionStateId: uuid("jurisdiction_state_id").references(() => states.id), // null = national
    officialUrl: text("official_url"),
    lookupUrl: text("lookup_url"),
    policyVersion: text("policy_version").notNull().default("2026-10"),
    acceptedForBooking: boolean("accepted_for_booking").notNull().default(false),
    publicLabel: text("public_label"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("credential_authorities_name_juris_uq").on(t.name, sql`coalesce(${t.jurisdictionStateId}, '00000000-0000-0000-0000-000000000000'::uuid)`)],
);

/** Claimed credential with separate verification status (VER-01, DAT-21). */
export const credentials = pgTable(
  "credentials",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    authorityId: uuid("authority_id").notNull().references(() => credentialAuthorities.id),
    type: credentialType("type").notNull(),
    numberOriginal: text("number_original"),
    numberNormalised: text("number_normalised"),
    issueDate: date("issue_date"),
    expiresOn: date("expires_on"),
    status: credentialStatus("status").notNull().default("self_declared"),
    source: text("source"),
    evidenceAssetId: uuid("evidence_asset_id"),
    publicNumberApproved: boolean("public_number_approved").notNull().default(false),
    scopeOfCheck: text("scope_of_check"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("credentials_practitioner_idx").on(t.practitionerId),
    index("credentials_expiry_idx").on(t.expiresOn).where(sql`${t.expiresOn} IS NOT NULL`),
    index("credentials_dup_idx").on(t.authorityId, t.type, t.numberNormalised),
    // DAT-21: authoritatively verified numbers are unique per authority and type.
    uniqueIndex("credentials_verified_number_uq")
      .on(t.authorityId, t.type, t.numberNormalised)
      .where(sql`${t.status} = 'registration_checked' AND ${t.numberNormalised} IS NOT NULL`),
  ],
);

export const practitionerSpecialties = pgTable(
  "practitioner_specialties",
  {
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    specialtyId: uuid("specialty_id").notNull().references(() => specialties.id),
    isPrimary: boolean("is_primary").notNull().default(false),
    evidenceAssetId: uuid("evidence_asset_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("practitioner_specialties_uq").on(t.practitionerId, t.specialtyId),
    uniqueIndex("practitioner_specialties_primary_uq").on(t.practitionerId).where(sql`${t.isPrimary}`),
    index("practitioner_specialties_specialty_idx").on(t.specialtyId),
  ],
);

export const practitionerLanguages = pgTable(
  "practitioner_languages",
  {
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    languageId: uuid("language_id").notNull().references(() => languages.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("practitioner_languages_uq").on(t.practitionerId, t.languageId),
    index("practitioner_languages_language_idx").on(t.languageId),
  ],
);

/** Awards, certifications, memberships, publications, links (PRO-08 optional portfolio). */
export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    kind: portfolioKind("kind").notNull(),
    title: text("title").notNull(),
    issuer: text("issuer"),
    itemDate: date("item_date"),
    url: text("url"),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("portfolio_items_practitioner_idx").on(t.practitionerId)],
);

/** Claim workflow (PRO-04 to PRO-06). */
export const claimRequests = pgTable(
  "claim_requests",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    claimantUserId: uuid("claimant_user_id").notNull().references(() => users.id),
    state: claimRequestState("state").notNull().default("requested"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    caseId: uuid("case_id"),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id),
    decisionReason: text("decision_reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("claim_requests_practitioner_idx").on(t.practitionerId, t.state),
    index("claim_requests_claimant_idx").on(t.claimantUserId),
  ],
);

/** Duplicate candidates for review rather than automatic merge (PRO-05). */
export const duplicateCandidates = pgTable(
  "duplicate_candidates",
  {
    id: id(),
    practitionerAId: uuid("practitioner_a_id").notNull().references(() => practitioners.id),
    practitionerBId: uuid("practitioner_b_id").notNull().references(() => practitioners.id),
    matchReasons: text("match_reasons").array().notNull(),
    score: integer("score").notNull().default(0),
    caseId: uuid("case_id"),
    resolved: boolean("resolved").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("duplicate_candidates_pair_uq").on(t.practitionerAId, t.practitionerBId)],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: id(),
    batchId: uuid("batch_id").notNull().references(() => importBatches.id),
    rowNo: integer("row_no").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    state: importRowState("state").notNull().default("pending"),
    errors: jsonb("errors").$type<string[]>(),
    practitionerId: uuid("practitioner_id").references(() => practitioners.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("import_rows_batch_row_uq").on(t.batchId, t.rowNo), index("import_rows_state_idx").on(t.batchId, t.state)],
);
