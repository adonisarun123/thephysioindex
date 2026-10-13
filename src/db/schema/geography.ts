import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./_common";
import { aliasKind, geoStatus, geoTargetType, proposalState, stateKind } from "./enums";
import { users } from "./identity";

/** States and union territories (DIR-07). */
export const states = pgTable(
  "states",
  {
    id: id(),
    code: text("code").notNull(), // ISO 3166-2:IN suffix, e.g. KA
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    kind: stateKind("kind").notNull().default("state"),
    status: geoStatus("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("states_code_uq").on(t.code), uniqueIndex("states_slug_uq").on(t.slug)],
);

/** Optional administrative districts; retained but never a required browse level (DIR-07). */
export const districts = pgTable(
  "districts",
  {
    id: id(),
    stateId: uuid("state_id").notNull().references(() => states.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: geoStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [uniqueIndex("districts_state_slug_uq").on(t.stateId, t.slug)],
);

export const cities = pgTable(
  "cities",
  {
    id: id(),
    stateId: uuid("state_id").notNull().references(() => states.id),
    districtId: uuid("district_id").references(() => districts.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: geoStatus("status").notNull().default("active"),
    isMetro: boolean("is_metro").notNull().default(false),
    tier: integer("tier"), // 1 = metro, 2 = large city, 3 = other
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    mergedIntoCityId: uuid("merged_into_city_id"),
    seoIntro: text("seo_intro"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("cities_state_slug_uq").on(t.stateId, t.slug),
    index("cities_state_status_idx").on(t.stateId, t.status),
    index("cities_name_trgm_idx").using("gin", sql`lower(${t.name}) gin_trgm_ops`),
  ],
);

export const localities = pgTable(
  "localities",
  {
    id: id(),
    cityId: uuid("city_id").notNull().references(() => cities.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: geoStatus("status").notNull().default("active"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    pinCodes: text("pin_codes").array(),
    mergedIntoLocalityId: uuid("merged_into_locality_id"),
    seoIntro: text("seo_intro"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("localities_city_slug_uq").on(t.cityId, t.slug),
    index("localities_city_status_idx").on(t.cityId, t.status),
    index("localities_name_trgm_idx").using("gin", sql`lower(${t.name}) gin_trgm_ops`),
  ],
);

/** Aliases: Bengaluru/Bangalore, spelling variants, renamed places (DIR-08). */
export const geoAliases = pgTable(
  "geo_aliases",
  {
    id: id(),
    targetType: geoTargetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    alias: text("alias").notNull(),
    aliasNormalised: text("alias_normalised").notNull(),
    kind: aliasKind("kind").notNull().default("spelling"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("geo_aliases_target_alias_uq").on(t.targetType, t.targetId, t.aliasNormalised),
    index("geo_aliases_normalised_idx").on(t.aliasNormalised),
  ],
);

/** Old slugs kept as permanent redirects after merges or renames (DIR-15, SEO-05). */
export const geoSlugRedirects = pgTable(
  "geo_slug_redirects",
  {
    id: id(),
    targetType: geoTargetType("target_type").notNull(),
    oldPath: text("old_path").notNull(),
    targetId: uuid("target_id").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("geo_slug_redirects_path_uq").on(t.oldPath)],
);

/** New localities proposed during onboarding enter review instead of creating duplicate pages (DIR-08). */
export const localityProposals = pgTable(
  "locality_proposals",
  {
    id: id(),
    cityId: uuid("city_id").notNull().references(() => cities.id),
    proposedName: text("proposed_name").notNull(),
    proposedPinCode: text("proposed_pin_code"),
    proposedByUserId: uuid("proposed_by_user_id").references(() => users.id),
    practitionerId: uuid("practitioner_id"),
    branchId: uuid("branch_id"),
    state: proposalState("state").notNull().default("pending"),
    resolvedLocalityId: uuid("resolved_locality_id").references(() => localities.id),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id),
    decisionReason: text("decision_reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("locality_proposals_state_idx").on(t.state, t.createdAt)],
);

/** Controlled taxonomy of areas of practice (PRO-08). */
export const specialties = pgTable(
  "specialties",
  {
    id: id(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    parentId: uuid("parent_id"),
    requiresEvidence: boolean("requires_evidence").notNull().default(false),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("specialties_code_uq").on(t.code), uniqueIndex("specialties_slug_uq").on(t.slug)],
);

export const languages = pgTable(
  "languages",
  {
    id: id(),
    code: text("code").notNull(), // BCP-47
    label: text("label").notNull(),
    nativeLabel: text("native_label"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("languages_code_uq").on(t.code)],
);
