import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { VERIFICATION_CATEGORY_SQL, type VerificationCategory } from "./verification";

/**
 * Public directory read models (DIR-10 to DIR-14, PRO-09, DAT-02).
 * Only published, non-suspended practitioners with an approved, published
 * branch association are ever returned. Test accounts are hidden unless the
 * environment explicitly shows them (preview deployments).
 */

export const RANKING_VERSION = "rank-2026-10-v1";
const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;

export type SearchFilters = {
  q?: string;
  stateSlug?: string;
  citySlug?: string;
  localitySlug?: string;
  specialtySlug?: string;
  languageCode?: string;
  gender?: "female" | "male" | "non_binary";
  feeMinPaise?: number;
  feeMaxPaise?: number;
  verification?: "registration_checked" | "document_reviewed" | "any_reviewed";
  bookable?: boolean;
  sort?: "relevance" | "fee_asc" | "fee_desc";
  cursor?: string;
  limit?: number;
};

export type PractitionerCard = {
  id: string;
  publicId: string;
  slug: string;
  path: string;
  displayName: string;
  designation: string | null;
  headline: string | null;
  primaryQualification: string | null;
  primarySpecialty: string | null;
  verification: VerificationCategory;
  reviewCount: number;
  ratingAvgX100: number | null;
  bookable: boolean;
  bookingPaused: boolean;
  claimed: boolean;
  startingFeePaise: number | null;
  startingFeeOfferingId: string | null;
  bestBranch: {
    id: string;
    clinicName: string;
    clinicPath: string;
    localityName: string;
    cityName: string;
    stateName: string;
  };
  otherBranchCount: number;
  otherBranches: { localityName: string; cityName: string }[];
};

export type SearchResult = {
  items: PractitionerCard[];
  nextCursor: string | null;
  total: number;
  rankingVersion: string;
  appliedFilters: SearchFilters;
};

function encodeCursor(offset: number, key: string): string {
  return Buffer.from(JSON.stringify({ o: offset, k: key }), "utf8").toString("base64url");
}
function decodeCursor(cursor: string | undefined, key: string): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o: number; k: string };
    if (parsed.k !== key) return 0; // filters changed; restart
    return Math.max(0, Number(parsed.o) || 0);
  } catch {
    return 0;
  }
}

function showTestAccounts(): boolean {
  return process.env.SHOW_TEST_ACCOUNTS === "1";
}

export async function searchPractitioners(f: SearchFilters): Promise<SearchResult> {
  const limit = Math.min(PAGE_MAX, Math.max(1, f.limit ?? PAGE_DEFAULT));
  const filterKey = JSON.stringify({ ...f, cursor: undefined, limit: undefined, v: RANKING_VERSION });
  const offset = decodeCursor(f.cursor, filterKey);

  const where: SQL[] = [
    sql`p.listing_status = 'published'`,
    sql`p.suspended_at IS NULL`,
    sql`pb.state = 'approved' AND pb.active_to IS NULL`,
    sql`b.status = 'published'`,
    sql`c.status = 'published'`,
  ];
  if (!showTestAccounts()) where.push(sql`p.is_test_account = false`);
  if (f.stateSlug) where.push(sql`st.slug = ${f.stateSlug}`);
  if (f.citySlug) where.push(sql`ci.slug = ${f.citySlug}`);
  if (f.localitySlug) where.push(sql`l.slug = ${f.localitySlug}`);
  if (f.specialtySlug) {
    where.push(sql`EXISTS (select 1 from practitioner_specialties ps join specialties s on s.id = ps.specialty_id where ps.practitioner_id = p.id and s.slug = ${f.specialtySlug})`);
  }
  if (f.languageCode) {
    where.push(sql`EXISTS (select 1 from practitioner_languages pl join languages lg on lg.id = pl.language_id where pl.practitioner_id = p.id and lg.code = ${f.languageCode})`);
  }
  if (f.gender) where.push(sql`p.gender = ${f.gender}`);
  if (f.bookable) where.push(sql`p.booking_eligible = true AND p.booking_paused = false`);

  const qTrim = f.q?.trim();
  const hasQ = Boolean(qTrim && qTrim.length >= 2);
  const relevance = hasQ
    ? sql`greatest(
        ts_rank(p.search_vector, plainto_tsquery('simple', ${qTrim})),
        similarity(lower(p.display_name), lower(${qTrim})),
        similarity(lower(c.name), lower(${qTrim})) * 0.8
      )`
    : sql`0::real`;
  if (hasQ) {
    where.push(sql`(
      p.search_vector @@ plainto_tsquery('simple', ${qTrim})
      OR lower(p.display_name) % lower(${qTrim})
      OR lower(c.name) % lower(${qTrim})
    )`);
  }

  const verificationSql = sql.raw(VERIFICATION_CATEGORY_SQL);
  const verificationFilter =
    f.verification === "registration_checked"
      ? sql`AND verification = 'registration_checked'`
      : f.verification === "document_reviewed"
        ? sql`AND verification IN ('registration_checked','document_reviewed')`
        : f.verification === "any_reviewed"
          ? sql`AND verification IN ('registration_checked','document_reviewed','enrolment_only','membership_only')`
          : sql``;
  const feeFilter = sql.join(
    [
      f.feeMinPaise != null ? sql`AND starting_fee_paise >= ${f.feeMinPaise}` : sql``,
      f.feeMaxPaise != null ? sql`AND starting_fee_paise <= ${f.feeMaxPaise}` : sql``,
    ],
    sql` `,
  );

  const orderBy =
    f.sort === "fee_asc"
      ? sql`starting_fee_paise ASC NULLS LAST, loc_score DESC, public_id ASC`
      : f.sort === "fee_desc"
        ? sql`starting_fee_paise DESC NULLS LAST, loc_score DESC, public_id ASC`
        : sql`relevance DESC, loc_score DESC, bookable DESC, public_id ASC`;

  const query = sql`
    WITH cand AS (
      SELECT
        p.id AS practitioner_id,
        b.id AS branch_id,
        c.name AS clinic_name,
        '/clinics/' || c.slug || '-' || c.public_id AS clinic_path,
        l.name AS locality_name,
        ci.name AS city_name,
        st.name AS state_name,
        (CASE
          WHEN ${f.localitySlug ?? null}::text IS NOT NULL AND l.slug = ${f.localitySlug ?? null} THEN 3
          WHEN ${f.citySlug ?? null}::text IS NOT NULL AND ci.slug = ${f.citySlug ?? null} THEN 2
          WHEN ${f.stateSlug ?? null}::text IS NOT NULL AND st.slug = ${f.stateSlug ?? null} THEN 1
          ELSE 0 END) AS loc_score,
        (SELECT min(ov.base_price_paise)
           FROM offerings o JOIN offering_versions ov ON ov.id = o.current_version_id
          WHERE o.practitioner_branch_id = pb.id AND o.active) AS branch_min_fee,
        (SELECT o.id
           FROM offerings o JOIN offering_versions ov ON ov.id = o.current_version_id
          WHERE o.practitioner_branch_id = pb.id AND o.active
          ORDER BY ov.base_price_paise ASC LIMIT 1) AS branch_min_fee_offering_id,
        ${relevance} AS relevance
      FROM practitioners p
      JOIN practitioner_branches pb ON pb.practitioner_id = p.id
      JOIN branches b ON b.id = pb.branch_id
      JOIN clinics c ON c.id = b.clinic_id
      JOIN localities l ON l.id = b.locality_id
      JOIN cities ci ON ci.id = b.city_id
      JOIN states st ON st.id = b.state_id
      WHERE ${sql.join(where, sql` AND `)}
    ),
    ranked AS (
      SELECT *,
        row_number() OVER (PARTITION BY practitioner_id ORDER BY loc_score DESC, branch_min_fee ASC NULLS LAST, branch_id) AS rn,
        count(*) OVER (PARTITION BY practitioner_id) AS branch_count,
        min(branch_min_fee) OVER (PARTITION BY practitioner_id) AS starting_fee_paise
      FROM cand
    ),
    cards AS (
      SELECT r.*,
        p.public_id, p.slug, p.display_name, p.designation, p.headline, p.review_count, p.rating_avg_x100,
        (p.booking_eligible AND NOT p.booking_paused) AS bookable,
        p.booking_paused,
        (p.claim_state = 'claimed') AS claimed,
        (SELECT q.degree FROM qualifications q WHERE q.practitioner_id = p.id ORDER BY q.sort_order, q.completion_year DESC NULLS LAST LIMIT 1) AS primary_qualification,
        (SELECT s.label FROM practitioner_specialties ps JOIN specialties s ON s.id = ps.specialty_id WHERE ps.practitioner_id = p.id ORDER BY ps.is_primary DESC, s.sort_order LIMIT 1) AS primary_specialty,
        ${verificationSql} AS verification,
        (SELECT json_agg(json_build_object('localityName', o.locality_name, 'cityName', o.city_name) ORDER BY o.loc_score DESC)
           FROM ranked o WHERE o.practitioner_id = r.practitioner_id AND o.rn > 1 AND o.rn <= 4) AS other_branches
      FROM ranked r
      JOIN practitioners p ON p.id = r.practitioner_id
      WHERE r.rn = 1
    ),
    filtered AS (
      SELECT * FROM cards WHERE true ${verificationFilter} ${feeFilter}
    )
    SELECT *, count(*) OVER () AS total
    FROM filtered
    ORDER BY ${orderBy}
    LIMIT ${limit + 1} OFFSET ${offset}
  `;

  type Row = {
    practitioner_id: string;
    branch_id: string;
    clinic_name: string;
    clinic_path: string;
    locality_name: string;
    city_name: string;
    state_name: string;
    branch_count: number;
    starting_fee_paise: number | string | null;
    branch_min_fee_offering_id: string | null;
    public_id: string;
    slug: string;
    display_name: string;
    designation: string | null;
    headline: string | null;
    review_count: number;
    rating_avg_x100: number | null;
    bookable: boolean;
    booking_paused: boolean;
    claimed: boolean;
    primary_qualification: string | null;
    primary_specialty: string | null;
    verification: VerificationCategory;
    other_branches: { localityName: string; cityName: string }[] | null;
    total: number | string;
  };

  const res = await db().execute<Row>(query);
  const rows = res.rows;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const items: PractitionerCard[] = page.map((r) => ({
    id: r.practitioner_id,
    publicId: r.public_id,
    slug: r.slug,
    path: `/physiotherapist/${r.slug}-${r.public_id}`,
    displayName: r.display_name,
    designation: r.designation,
    headline: r.headline,
    primaryQualification: r.primary_qualification,
    primarySpecialty: r.primary_specialty,
    verification: r.verification ?? "not_verified",
    reviewCount: r.review_count,
    ratingAvgX100: r.rating_avg_x100,
    bookable: r.bookable,
    bookingPaused: r.booking_paused,
    claimed: r.claimed,
    startingFeePaise: r.starting_fee_paise == null ? null : Number(r.starting_fee_paise),
    startingFeeOfferingId: r.branch_min_fee_offering_id,
    bestBranch: {
      id: r.branch_id,
      clinicName: r.clinic_name,
      clinicPath: r.clinic_path,
      localityName: r.locality_name,
      cityName: r.city_name,
      stateName: r.state_name,
    },
    otherBranchCount: Number(r.branch_count) - 1,
    otherBranches: r.other_branches ?? [],
  }));
  return {
    items,
    nextCursor: hasMore ? encodeCursor(offset + limit, filterKey) : null,
    total: rows[0] ? Number(rows[0].total) : 0,
    rankingVersion: RANKING_VERSION,
    appliedFilters: f,
  };
}

// ---------------------------------------------------------------------------
// Profile read model (PRO-08, PRO-09, PRO-11, DAT-02)
// ---------------------------------------------------------------------------

export type PublicProfile = {
  id: string;
  publicId: string;
  slug: string;
  path: string;
  listingStatus: string;
  displayName: string;
  designation: string | null;
  headline: string | null;
  gender: string;
  claimed: boolean;
  bookable: boolean;
  bookingPaused: boolean;
  reviewCount: number;
  ratingAvgX100: number | null;
  publishedAt: string | null;
  practiceStartDate: string | null;
  about: string | null;
  verification: VerificationCategory;
  credentials: {
    type: string;
    status: string;
    authorityName: string;
    authorityKind: string;
    jurisdiction: string | null;
    publicNumber: string | null;
    lastCheckedAt: string | null;
    scopeOfCheck: string | null;
    publicLabel: string | null;
  }[];
  qualifications: { degree: string; institution: string; completionYear: number | null; inProgress: boolean }[];
  experiences: { role: string; organisationName: string; startMonth: string; endMonth: string | null; description: string | null }[];
  specialties: { label: string; slug: string; isPrimary: boolean }[];
  languages: { label: string; code: string }[];
  portfolio: { kind: string; title: string; issuer: string | null; itemDate: string | null; url: string | null; description: string | null }[];
  branches: {
    id: string;
    name: string;
    clinicName: string;
    clinicPath: string;
    addressLine1: string;
    addressLine2: string | null;
    localityName: string;
    localitySlug: string;
    cityName: string;
    citySlug: string;
    stateName: string;
    stateSlug: string;
    pinCode: string;
    latitude: number | null;
    longitude: number | null;
    publicPhone: string | null;
    directions: string | null;
    accessibility: Record<string, unknown> | null;
    facilities: string[] | null;
    bookable: boolean;
    offerings: {
      id: string;
      displayName: string;
      mode: "clinic" | "home_visit" | "online";
      serviceLabel: string;
      serviceKind: string;
      durationMin: number;
      basePricePaise: number;
      taxPaise: number;
      extraChargesPaise: number;
      priceNote: string | null;
      bookingMode: string;
    }[];
  }[];
  reviews: { rating: number; text: string | null; displayName: string; publishedAt: string; reply: string | null }[];
};

export async function getPublicProfile(publicId: string): Promise<PublicProfile | null> {
  const testClause = showTestAccounts() ? sql`` : sql`AND p.is_test_account = false`;
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT p.id, p.public_id, p.slug, p.listing_status, p.display_name, p.designation, p.headline, p.gender,
      (p.claim_state = 'claimed') AS claimed,
      (p.booking_eligible AND NOT p.booking_paused) AS bookable,
      p.booking_paused, p.review_count, p.rating_avg_x100, p.published_at, p.practice_start_date,
      (SELECT pv.structured_content ->> 'about' FROM profile_versions pv WHERE pv.id = p.published_version_id) AS about,
      ${sql.raw(VERIFICATION_CATEGORY_SQL)} AS verification,
      (SELECT coalesce(json_agg(json_build_object(
          'type', c.type, 'status', c.status, 'authorityName', a.name, 'authorityKind', a.kind,
          'jurisdiction', (SELECT s.name FROM states s WHERE s.id = a.jurisdiction_state_id),
          'publicNumber', CASE WHEN c.public_number_approved AND c.status = 'registration_checked' THEN c.number_original END,
          'lastCheckedAt', c.last_checked_at, 'scopeOfCheck', c.scope_of_check, 'publicLabel', a.public_label
        ) ORDER BY c.type), '[]'::json)
        FROM credentials c JOIN credential_authorities a ON a.id = c.authority_id WHERE c.practitioner_id = p.id) AS credentials,
      (SELECT coalesce(json_agg(json_build_object('degree', q.degree, 'institution', q.institution, 'completionYear', q.completion_year, 'inProgress', q.in_progress) ORDER BY q.sort_order, q.completion_year DESC NULLS LAST), '[]'::json)
        FROM qualifications q WHERE q.practitioner_id = p.id) AS qualifications,
      (SELECT coalesce(json_agg(json_build_object('role', e.role, 'organisationName', e.organisation_name, 'startMonth', e.start_month, 'endMonth', e.end_month, 'description', e.description) ORDER BY e.end_month DESC NULLS FIRST, e.start_month DESC), '[]'::json)
        FROM experiences e WHERE e.practitioner_id = p.id) AS experiences,
      (SELECT coalesce(json_agg(json_build_object('label', s.label, 'slug', s.slug, 'isPrimary', ps.is_primary) ORDER BY ps.is_primary DESC, s.sort_order), '[]'::json)
        FROM practitioner_specialties ps JOIN specialties s ON s.id = ps.specialty_id WHERE ps.practitioner_id = p.id) AS specialties,
      (SELECT coalesce(json_agg(json_build_object('label', lg.label, 'code', lg.code) ORDER BY lg.sort_order), '[]'::json)
        FROM practitioner_languages pl JOIN languages lg ON lg.id = pl.language_id WHERE pl.practitioner_id = p.id) AS languages,
      (SELECT coalesce(json_agg(json_build_object('kind', pi.kind, 'title', pi.title, 'issuer', pi.issuer, 'itemDate', pi.item_date, 'url', pi.url, 'description', pi.description) ORDER BY pi.sort_order, pi.item_date DESC NULLS LAST), '[]'::json)
        FROM portfolio_items pi WHERE pi.practitioner_id = p.id) AS portfolio,
      (SELECT coalesce(json_agg(json_build_object(
          'id', b.id, 'name', b.name, 'clinicName', c.name, 'clinicPath', '/clinics/' || c.slug || '-' || c.public_id,
          'addressLine1', b.address_line1, 'addressLine2', b.address_line2,
          'localityName', l.name, 'localitySlug', l.slug, 'cityName', ci.name, 'citySlug', ci.slug, 'stateName', st.name, 'stateSlug', st.slug,
          'pinCode', b.pin_code, 'latitude', b.latitude, 'longitude', b.longitude, 'publicPhone',
            CASE WHEN coalesce((pb.public_contact_rules ->> 'showBranchPhone')::boolean, true) THEN b.public_phone END,
          'directions', b.directions, 'accessibility', b.accessibility, 'facilities', b.facilities,
          'bookable', pb.bookable,
          'offerings', (SELECT coalesce(json_agg(json_build_object(
              'id', o.id, 'displayName', o.display_name, 'mode', o.mode, 'serviceLabel', sv.label, 'serviceKind', sv.kind,
              'durationMin', ov.duration_min, 'basePricePaise', ov.base_price_paise, 'taxPaise', ov.tax_paise,
              'extraChargesPaise', ov.extra_charges_paise, 'priceNote', ov.price_note, 'bookingMode', ov.booking_mode
            ) ORDER BY sv.sort_order, ov.base_price_paise), '[]'::json)
            FROM offerings o JOIN offering_versions ov ON ov.id = o.current_version_id JOIN services sv ON sv.id = o.service_id
            WHERE o.practitioner_branch_id = pb.id AND o.active)
        ) ORDER BY pb.active_from), '[]'::json)
        FROM practitioner_branches pb
        JOIN branches b ON b.id = pb.branch_id AND b.status = 'published'
        JOIN clinics c ON c.id = b.clinic_id AND c.status = 'published'
        JOIN localities l ON l.id = b.locality_id JOIN cities ci ON ci.id = b.city_id JOIN states st ON st.id = b.state_id
        WHERE pb.practitioner_id = p.id AND pb.state = 'approved' AND pb.active_to IS NULL) AS branches,
      (SELECT coalesce(json_agg(json_build_object('rating', r.rating, 'text', r.text, 'displayName', r.display_name, 'publishedAt', r.published_at,
          'reply', (SELECT rr.text FROM review_replies rr WHERE rr.review_id = r.id AND rr.state = 'approved' ORDER BY rr.version DESC LIMIT 1)
        ) ORDER BY r.published_at DESC), '[]'::json)
        FROM (SELECT * FROM reviews r0 WHERE r0.practitioner_id = p.id AND r0.state = 'published' ORDER BY r0.published_at DESC LIMIT 20) r) AS reviews
    FROM practitioners p
    WHERE p.public_id = ${publicId}
      AND p.listing_status IN ('published', 'suspended')
      ${testClause}
    LIMIT 1
  `);
  const r = res.rows[0];
  if (!r) return null;
  const toIso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
  return {
    id: String(r.id),
    publicId: String(r.public_id),
    slug: String(r.slug),
    path: `/physiotherapist/${r.slug}-${r.public_id}`,
    listingStatus: String(r.listing_status),
    displayName: String(r.display_name),
    designation: (r.designation as string | null) ?? null,
    headline: (r.headline as string | null) ?? null,
    gender: String(r.gender),
    claimed: Boolean(r.claimed),
    bookable: Boolean(r.bookable),
    bookingPaused: Boolean(r.booking_paused),
    reviewCount: Number(r.review_count),
    ratingAvgX100: r.rating_avg_x100 == null ? null : Number(r.rating_avg_x100),
    publishedAt: toIso(r.published_at),
    practiceStartDate: toIso(r.practice_start_date),
    about: (r.about as string | null) ?? null,
    verification: (r.verification as VerificationCategory) ?? "not_verified",
    credentials: r.credentials as PublicProfile["credentials"],
    qualifications: r.qualifications as PublicProfile["qualifications"],
    experiences: r.experiences as PublicProfile["experiences"],
    specialties: r.specialties as PublicProfile["specialties"],
    languages: r.languages as PublicProfile["languages"],
    portfolio: r.portfolio as PublicProfile["portfolio"],
    branches: (r.branches as PublicProfile["branches"]).map((b) => ({
      ...b,
      offerings: b.offerings.map((o) => ({
        ...o,
        basePricePaise: Number(o.basePricePaise),
        taxPaise: Number(o.taxPaise),
        extraChargesPaise: Number(o.extraChargesPaise),
      })),
    })),
    reviews: r.reviews as PublicProfile["reviews"],
  };
}

/** Resolve an old slug to the current canonical path (DIR-06, SEO-05). */
export async function resolvePractitionerSlug(slugWithId: string): Promise<{ publicId: string; slug: string } | null> {
  const idx = slugWithId.lastIndexOf("-");
  const publicId = idx >= 0 ? slugWithId.slice(idx + 1) : slugWithId;
  if (!/^[a-z0-9]{6,12}$/i.test(publicId)) return null;
  const res = await db().execute<{ public_id: string; slug: string }>(sql`
    SELECT public_id, slug FROM practitioners WHERE public_id = ${publicId} LIMIT 1
  `);
  const row = res.rows[0];
  return row ? { publicId: row.public_id, slug: row.slug } : null;
}

// ---------------------------------------------------------------------------
// Clinics
// ---------------------------------------------------------------------------

export type PublicClinic = {
  id: string;
  publicId: string;
  slug: string;
  path: string;
  name: string;
  about: string | null;
  website: string | null;
  publicPhone: string | null;
  branches: {
    id: string;
    name: string;
    addressLine1: string;
    addressLine2: string | null;
    localityName: string;
    cityName: string;
    stateName: string;
    citySlug: string;
    stateSlug: string;
    localitySlug: string;
    pinCode: string;
    latitude: number | null;
    longitude: number | null;
    publicPhone: string | null;
    workingHours: Record<string, { open: string; close: string }[]> | null;
    facilities: string[] | null;
    practitioners: { publicId: string; slug: string; displayName: string; designation: string | null }[];
  }[];
};

export async function getPublicClinic(publicId: string): Promise<PublicClinic | null> {
  const res = await db().execute<Record<string, unknown>>(sql`
    SELECT c.id, c.public_id, c.slug, c.name, c.about, c.website, c.public_phone,
      (SELECT coalesce(json_agg(json_build_object(
          'id', b.id, 'name', b.name, 'addressLine1', b.address_line1, 'addressLine2', b.address_line2,
          'localityName', l.name, 'cityName', ci.name, 'stateName', st.name, 'citySlug', ci.slug, 'stateSlug', st.slug, 'localitySlug', l.slug,
          'pinCode', b.pin_code, 'latitude', b.latitude, 'longitude', b.longitude, 'publicPhone', b.public_phone,
          'workingHours', b.working_hours, 'facilities', b.facilities,
          'practitioners', (SELECT coalesce(json_agg(json_build_object('publicId', p.public_id, 'slug', p.slug, 'displayName', p.display_name, 'designation', p.designation) ORDER BY p.display_name), '[]'::json)
            FROM practitioner_branches pb JOIN practitioners p ON p.id = pb.practitioner_id
            WHERE pb.branch_id = b.id AND pb.state = 'approved' AND pb.active_to IS NULL AND p.listing_status = 'published' AND p.suspended_at IS NULL
              ${showTestAccounts() ? sql`` : sql`AND p.is_test_account = false`})
        ) ORDER BY b.name), '[]'::json)
        FROM branches b JOIN localities l ON l.id = b.locality_id JOIN cities ci ON ci.id = b.city_id JOIN states st ON st.id = b.state_id
        WHERE b.clinic_id = c.id AND b.status = 'published') AS branches
    FROM clinics c WHERE c.public_id = ${publicId} AND c.status = 'published' LIMIT 1
  `);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    publicId: String(r.public_id),
    slug: String(r.slug),
    path: `/clinics/${r.slug}-${r.public_id}`,
    name: String(r.name),
    about: (r.about as string | null) ?? null,
    website: (r.website as string | null) ?? null,
    publicPhone: (r.public_phone as string | null) ?? null,
    branches: r.branches as PublicClinic["branches"],
  };
}

// ---------------------------------------------------------------------------
// Sitemap feeds (SEO-01, SEO-02)
// ---------------------------------------------------------------------------

export async function listPublishedPractitionerPaths(offset: number, limit: number) {
  const res = await db().execute<{ path: string; updated_at: Date }>(sql`
    SELECT '/physiotherapist/' || p.slug || '-' || p.public_id AS path, p.updated_at
    FROM practitioners p
    WHERE p.listing_status = 'published' AND p.suspended_at IS NULL AND p.is_test_account = false
      AND EXISTS (SELECT 1 FROM practitioner_branches pb JOIN branches b ON b.id = pb.branch_id
                  WHERE pb.practitioner_id = p.id AND pb.state = 'approved' AND pb.active_to IS NULL AND b.status = 'published')
    ORDER BY p.public_id
    OFFSET ${offset} LIMIT ${limit}
  `);
  return res.rows;
}

export async function countPublishedPractitioners(): Promise<number> {
  const res = await db().execute<{ n: number | string }>(sql`
    SELECT count(*) AS n FROM practitioners p
    WHERE p.listing_status = 'published' AND p.suspended_at IS NULL AND p.is_test_account = false
  `);
  return Number(res.rows[0]?.n ?? 0);
}

export async function listPublishedClinicPaths() {
  const res = await db().execute<{ path: string; updated_at: Date }>(sql`
    SELECT '/clinics/' || c.slug || '-' || c.public_id AS path, c.updated_at
    FROM clinics c WHERE c.status = 'published' ORDER BY c.public_id
  `);
  return res.rows;
}

/** Location pages worth indexing: those with at least one published practitioner (SEO-02). */
export async function listIndexableLocationPaths() {
  const res = await db().execute<{ path: string }>(sql`
    SELECT DISTINCT '/physiotherapists/' || st.slug AS path FROM states st
      JOIN branches b ON b.state_id = st.id AND b.status = 'published'
      JOIN practitioner_branches pb ON pb.branch_id = b.id AND pb.state = 'approved' AND pb.active_to IS NULL
      JOIN practitioners p ON p.id = pb.practitioner_id AND p.listing_status = 'published' AND p.is_test_account = false
    UNION
    SELECT DISTINCT '/physiotherapists/' || st.slug || '/' || ci.slug FROM cities ci JOIN states st ON st.id = ci.state_id
      JOIN branches b ON b.city_id = ci.id AND b.status = 'published'
      JOIN practitioner_branches pb ON pb.branch_id = b.id AND pb.state = 'approved' AND pb.active_to IS NULL
      JOIN practitioners p ON p.id = pb.practitioner_id AND p.listing_status = 'published' AND p.is_test_account = false
    UNION
    SELECT DISTINCT '/physiotherapists/' || st.slug || '/' || ci.slug || '/' || l.slug FROM localities l JOIN cities ci ON ci.id = l.city_id JOIN states st ON st.id = ci.state_id
      JOIN branches b ON b.locality_id = l.id AND b.status = 'published'
      JOIN practitioner_branches pb ON pb.branch_id = b.id AND pb.state = 'approved' AND pb.active_to IS NULL
      JOIN practitioners p ON p.id = pb.practitioner_id AND p.listing_status = 'published' AND p.is_test_account = false
    ORDER BY 1
  `);
  return res.rows.map((r) => r.path);
}
