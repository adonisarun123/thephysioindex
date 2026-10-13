import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import { associationState, bookingMode, branchStatus, clinicStatus, serviceKind, serviceMode } from "./enums";
import { cities, localities, states } from "./geography";
import { users } from "./identity";
import { practitioners } from "./practitioners";

/** Clinic = care organisation (LOC-01). Ownership is reviewed separately from affiliation (LOC-03). */
export const clinics = pgTable(
  "clinics",
  {
    id: id(),
    publicId: text("public_id").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
    publicPhone: text("public_phone"),
    publicEmail: text("public_email"),
    website: text("website"),
    about: text("about"),
    status: clinicStatus("status").notNull().default("draft"),
    logoAssetId: uuid("logo_asset_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("clinics_public_id_uq").on(t.publicId),
    index("clinics_slug_idx").on(t.slug),
    index("clinics_name_trgm_idx").using("gin", sql`lower(${t.name}) gin_trgm_ops`),
  ],
);

export type WorkingHours = Record<string, { open: string; close: string }[]>; // weekday "0".."6" -> windows

/** Branch = physical practice location (LOC-01). PIN is a 6-digit string, not a geo identifier. */
export const branches = pgTable(
  "branches",
  {
    id: id(),
    clinicId: uuid("clinic_id").notNull().references(() => clinics.id),
    name: text("name").notNull(),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    localityId: uuid("locality_id").notNull().references(() => localities.id),
    cityId: uuid("city_id").notNull().references(() => cities.id),
    stateId: uuid("state_id").notNull().references(() => states.id),
    pinCode: char("pin_code", { length: 6 }).notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    geocodeSource: text("geocode_source"),
    workingHours: jsonb("working_hours").$type<WorkingHours>(),
    accessibility: jsonb("accessibility").$type<Record<string, boolean | string>>(),
    facilities: text("facilities").array(),
    directions: text("directions"),
    publicPhone: text("public_phone"),
    status: branchStatus("status").notNull().default("draft"),
    ...timestamps,
  },
  (t) => [
    index("branches_clinic_idx").on(t.clinicId),
    index("branches_locality_idx").on(t.localityId, t.status),
    index("branches_city_idx").on(t.cityId, t.status),
    check("branches_pin_format", sql`${t.pinCode} ~ '^[1-9][0-9]{5}$'`),
    check("branches_lat_range", sql`${t.latitude} IS NULL OR ${t.latitude} BETWEEN -90 AND 90`),
    check("branches_lng_range", sql`${t.longitude} IS NULL OR ${t.longitude} BETWEEN -180 AND 180`),
  ],
);

/** Practitioner to branch association with dates and approval (LOC-02). */
export const practitionerBranches = pgTable(
  "practitioner_branches",
  {
    id: id(),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    activeFrom: date("active_from").notNull().defaultNow(),
    activeTo: date("active_to"),
    state: associationState("state").notNull().default("pending"),
    bookable: boolean("bookable").notNull().default(true),
    publicContactRules: jsonb("public_contact_rules").$type<{ showBranchPhone?: boolean; showPractitionerPhone?: boolean }>(),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    endedReason: text("ended_reason"),
    ...timestamps,
  },
  (t) => [
    index("practitioner_branches_practitioner_idx").on(t.practitionerId, t.state),
    index("practitioner_branches_branch_idx").on(t.branchId, t.state),
    uniqueIndex("practitioner_branches_active_uq")
      .on(t.practitionerId, t.branchId)
      .where(sql`${t.state} IN ('pending', 'approved') AND ${t.activeTo} IS NULL`),
    check("practitioner_branches_dates", sql`${t.activeTo} IS NULL OR ${t.activeTo} >= ${t.activeFrom}`),
  ],
);

/** Service taxonomy (what is offered), separate from the offering (who, where, how much). */
export const services = pgTable(
  "services",
  {
    id: id(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    slug: text("slug").notNull(),
    kind: serviceKind("kind").notNull().default("other"),
    description: text("description"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("services_code_uq").on(t.code), uniqueIndex("services_slug_uq").on(t.slug)],
);

/** Offering: one practitioner + one service + one branch (clinic mode) (CAL-02). */
export const offerings = pgTable(
  "offerings",
  {
    id: id(),
    practitionerBranchId: uuid("practitioner_branch_id").notNull().references(() => practitionerBranches.id),
    practitionerId: uuid("practitioner_id").notNull().references(() => practitioners.id),
    branchId: uuid("branch_id").notNull().references(() => branches.id),
    serviceId: uuid("service_id").notNull().references(() => services.id),
    mode: serviceMode("mode").notNull().default("clinic"),
    displayName: text("display_name").notNull(),
    description: text("description"),
    active: boolean("active").notNull().default(false),
    currentVersionId: uuid("current_version_id"),
    ...timestamps,
  },
  (t) => [
    index("offerings_practitioner_idx").on(t.practitionerId, t.active),
    index("offerings_branch_idx").on(t.branchId, t.active),
    uniqueIndex("offerings_pb_service_mode_uq").on(t.practitionerBranchId, t.serviceId, t.mode),
  ],
);

/** Immutable effective-dated offering configuration; bookings reference the accepted version (CAL-02). */
export const offeringVersions = pgTable(
  "offering_versions",
  {
    id: id(),
    offeringId: uuid("offering_id").notNull().references(() => offerings.id),
    version: integer("version").notNull(),
    durationMin: integer("duration_min").notNull(),
    intervalMin: integer("interval_min").notNull(),
    bufferBeforeMin: integer("buffer_before_min").notNull().default(0),
    bufferAfterMin: integer("buffer_after_min").notNull().default(0),
    basePricePaise: bigint("base_price_paise", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("INR"),
    taxPaise: bigint("tax_paise", { mode: "number" }).notNull().default(0),
    extraChargesPaise: bigint("extra_charges_paise", { mode: "number" }).notNull().default(0),
    priceNote: text("price_note"), // e.g. "Initial assessment, 30 min, includes exercise plan"
    bookingHorizonDays: integer("booking_horizon_days").notNull().default(60),
    minNoticeMin: integer("min_notice_min").notNull().default(120),
    bookingMode: bookingMode("booking_mode").notNull().default("instant"),
    cancellationPolicyId: uuid("cancellation_policy_id"),
    activeFrom: date("active_from").notNull().defaultNow(),
    activeTo: date("active_to"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("offering_versions_offering_version_uq").on(t.offeringId, t.version),
    check("offering_versions_duration_pos", sql`${t.durationMin} > 0 AND ${t.durationMin} <= 480`),
    check("offering_versions_interval_pos", sql`${t.intervalMin} > 0 AND ${t.intervalMin} <= 240`),
    check("offering_versions_buffers_nonneg", sql`${t.bufferBeforeMin} >= 0 AND ${t.bufferAfterMin} >= 0`),
    check("offering_versions_price_nonneg", sql`${t.basePricePaise} >= 0 AND ${t.taxPaise} >= 0 AND ${t.extraChargesPaise} >= 0`),
    check("offering_versions_horizon", sql`${t.bookingHorizonDays} BETWEEN 1 AND 365`),
    check("offering_versions_notice", sql`${t.minNoticeMin} >= 0`),
  ],
);
