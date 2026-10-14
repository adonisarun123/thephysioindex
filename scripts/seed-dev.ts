/**
 * Development/preview-only data: clearly labelled TEST practitioners and
 * clinics so the directory can be exercised without inventing public listings
 * (DIR-14, Section 30 "Imported profiles"). Runs only when SEED_DEV_DATA=1 and
 * never against the production branch (guarded by role name check below).
 *
 *   SEED_DEV_DATA=1 npm run db:seed:dev
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { newPublicId } from "../src/lib/public-id";
import { normaliseRegistrationNumber, slugify } from "../src/lib/slug";

if (process.env.SEED_DEV_DATA !== "1") {
  console.log("[seed-dev] SEED_DEV_DATA is not 1; skipping");
  process.exit(0);
}

type Branch = { clinic: string; name: string; city: string; locality: string; pin: string; lat: number; lng: number; phone: string };
type Practitioner = {
  name: string;
  gender: "female" | "male" | "unset";
  headline: string;
  about: string;
  degree: [string, string, number];
  mpt?: [string, string, number];
  specialties: string[];
  languages: string[];
  branches: string[]; // branch names
  credentials: { authority: string; type: "statutory_registration" | "enrolment" | "association_membership"; status: "registration_checked" | "document_reviewed" | "self_declared" | "expired"; number?: string; checked?: boolean }[];
  fees: [number, number]; // initial, follow-up in rupees
  bookable: boolean;
  claimed: boolean;
  practiceStart: string;
  experiences: { role: string; org: string; from: string; to?: string }[];
};

const CLINICS: { name: string; about: string; phone: string }[] = [
  { name: "TEST Clinic Alpha Physiotherapy", about: "Test clinic used on preview deployments. Not a real provider.", phone: "+91 80000 00001" },
  { name: "TEST Clinic Beta Rehab", about: "Test clinic used on preview deployments. Not a real provider.", phone: "+91 80000 00002" },
  { name: "TEST Clinic Gamma Sports Physio", about: "Test clinic used on preview deployments. Not a real provider.", phone: "+91 80000 00003" },
];

const BRANCHES: Branch[] = [
  { clinic: CLINICS[0].name, name: "Indiranagar", city: "KA/Bengaluru", locality: "Indiranagar", pin: "560038", lat: 12.9719, lng: 77.6412, phone: "+91 80000 00011" },
  { clinic: CLINICS[0].name, name: "Koramangala", city: "KA/Bengaluru", locality: "Koramangala", pin: "560034", lat: 12.9352, lng: 77.6245, phone: "+91 80000 00012" },
  { clinic: CLINICS[0].name, name: "HSR Layout", city: "KA/Bengaluru", locality: "HSR Layout", pin: "560102", lat: 12.9116, lng: 77.6389, phone: "+91 80000 00013" },
  { clinic: CLINICS[1].name, name: "Bandra West", city: "MH/Mumbai", locality: "Bandra West", pin: "400050", lat: 19.0596, lng: 72.8295, phone: "+91 80000 00021" },
  { clinic: CLINICS[2].name, name: "Kothrud", city: "MH/Pune", locality: "Kothrud", pin: "411038", lat: 18.5074, lng: 73.8077, phone: "+91 80000 00031" },
  { clinic: CLINICS[2].name, name: "Adyar", city: "TN/Chennai", locality: "Adyar", pin: "600020", lat: 13.0012, lng: 80.2565, phone: "+91 80000 00032" },
  { clinic: CLINICS[2].name, name: "Banjara Hills", city: "TS/Hyderabad", locality: "Banjara Hills", pin: "500034", lat: 17.4156, lng: 78.4347, phone: "+91 80000 00033" },
  { clinic: CLINICS[2].name, name: "Saket", city: "DL/Delhi", locality: "Saket", pin: "110017", lat: 28.5245, lng: 77.2066, phone: "+91 80000 00034" },
];

const PRACTITIONERS: Practitioner[] = [
  {
    name: "TEST Ananya Rao", gender: "female", headline: "Orthopaedic and sports physiotherapist, 12 years in practice",
    about: "Test profile. Focus on post-surgical knee and shoulder rehabilitation and return-to-sport programmes.",
    degree: ["BPT", "Rajiv Gandhi University of Health Sciences", 2012], mpt: ["MPT (Orthopaedics)", "Manipal College of Health Professions", 2014],
    specialties: ["ortho", "sports", "post_surgical"], languages: ["en", "kn", "hi"], branches: ["Indiranagar", "Koramangala"],
    credentials: [
      { authority: "Karnataka State Allied and Healthcare Council", type: "statutory_registration", status: "registration_checked", number: "KA/PT/2014/01234", checked: true },
      { authority: "Indian Association of Physiotherapists", type: "association_membership", status: "document_reviewed", number: "L-45678" },
    ],
    fees: [900, 700], bookable: true, claimed: true, practiceStart: "2012-07-01",
    experiences: [{ role: "Senior Physiotherapist", org: "TEST Clinic Alpha Physiotherapy", from: "2018-04-01" }, { role: "Physiotherapist", org: "A multispecialty hospital, Bengaluru", from: "2012-07-01", to: "2018-03-01" }],
  },
  {
    name: "TEST Rohan Mehta", gender: "male", headline: "Neurological rehabilitation after stroke and spinal injury",
    about: "Test profile. Home exercise programmes and gait retraining.",
    degree: ["BPT", "Dr. D. Y. Patil Vidyapeeth", 2010], mpt: ["MPT (Neurology)", "Dr. D. Y. Patil Vidyapeeth", 2012],
    specialties: ["neuro", "geriatric"], languages: ["en", "hi", "mr"], branches: ["Koramangala"],
    credentials: [{ authority: "National Commission for Allied and Healthcare Professions", type: "enrolment", status: "document_reviewed", number: "AHP-TEST-2201" }],
    fees: [1000, 800], bookable: true, claimed: true, practiceStart: "2010-06-01",
    experiences: [{ role: "Consultant Physiotherapist", org: "TEST Clinic Alpha Physiotherapy", from: "2016-01-01" }],
  },
  {
    name: "TEST Priya Nair", gender: "female", headline: "Women's health and pelvic floor physiotherapy",
    about: "Test profile. Antenatal and postnatal care, pelvic floor rehabilitation.",
    degree: ["BPT", "Kerala University of Health Sciences", 2015],
    specialties: ["womens_health", "general"], languages: ["en", "ml", "kn"], branches: ["HSR Layout"],
    credentials: [{ authority: "Indian Association of Physiotherapists", type: "association_membership", status: "document_reviewed", number: "L-99887" }],
    fees: [800, 600], bookable: false, claimed: true, practiceStart: "2015-08-01",
    experiences: [{ role: "Physiotherapist", org: "TEST Clinic Alpha Physiotherapy", from: "2019-02-01" }],
  },
  {
    name: "TEST Vikram Shetty", gender: "male", headline: "Manual therapy and dry needling for chronic back and neck pain",
    about: "Test profile.",
    degree: ["BPT", "Manipal College of Health Professions", 2008],
    specialties: ["spine", "manual_therapy", "dry_needling"], languages: ["en", "kn", "tcy"], branches: ["Indiranagar"],
    credentials: [{ authority: "Karnataka State Allied and Healthcare Council", type: "statutory_registration", status: "self_declared", number: "KA/PT/2008/00987" }],
    fees: [1200, 900], bookable: false, claimed: false, practiceStart: "2008-06-01",
    experiences: [],
  },
  {
    name: "TEST Sneha Kulkarni", gender: "female", headline: "Sports injury rehabilitation and running analysis",
    about: "Test profile.",
    degree: ["BPT", "Maharashtra University of Health Sciences", 2013], mpt: ["MPT (Sports)", "Maharashtra University of Health Sciences", 2015],
    specialties: ["sports", "ortho"], languages: ["en", "mr", "hi"], branches: ["Kothrud"],
    credentials: [{ authority: "Maharashtra State OTPT Council", type: "statutory_registration", status: "registration_checked", number: "MH/PT/2013/55555", checked: true }],
    fees: [1000, 800], bookable: true, claimed: true, practiceStart: "2013-07-01",
    experiences: [{ role: "Lead Physiotherapist", org: "TEST Clinic Gamma Sports Physio", from: "2017-05-01" }],
  },
  {
    name: "TEST Arjun Iyer", gender: "male", headline: "Paediatric physiotherapy and developmental care",
    about: "Test profile.",
    degree: ["BPT", "Sri Ramachandra Institute", 2011], mpt: ["MPT (Paediatrics)", "Sri Ramachandra Institute", 2013],
    specialties: ["paediatric"], languages: ["en", "ta"], branches: ["Adyar"],
    credentials: [{ authority: "Tamil Nadu Allied and Healthcare Council", type: "statutory_registration", status: "document_reviewed", number: "TN/PT/2013/22222" }],
    fees: [900, 700], bookable: true, claimed: true, practiceStart: "2011-06-01",
    experiences: [{ role: "Paediatric Physiotherapist", org: "TEST Clinic Gamma Sports Physio", from: "2015-01-01" }],
  },
  {
    name: "TEST Kavya Reddy", gender: "female", headline: "Cardiopulmonary and post-operative rehabilitation",
    about: "Test profile.",
    degree: ["BPT", "Kaloji Narayana Rao University of Health Sciences", 2016],
    specialties: ["cardio_pulm", "post_surgical"], languages: ["en", "te", "hi"], branches: ["Banjara Hills"],
    credentials: [{ authority: "National Commission for Allied and Healthcare Professions", type: "enrolment", status: "registration_checked", number: "AHP-TEST-7788", checked: true }],
    fees: [700, 500], bookable: true, claimed: true, practiceStart: "2016-09-01",
    experiences: [{ role: "Physiotherapist", org: "TEST Clinic Gamma Sports Physio", from: "2018-08-01" }],
  },
  {
    name: "TEST Nikhil Verma", gender: "male", headline: "Spine care and ergonomics for desk workers",
    about: "Test profile.",
    degree: ["BPT", "Delhi University", 2009], mpt: ["MPT (Musculoskeletal)", "Jamia Hamdard", 2011],
    specialties: ["spine", "ergonomics"], languages: ["en", "hi", "pa"], branches: ["Saket"],
    credentials: [{ authority: "Delhi Council for Physiotherapy and Occupational Therapy", type: "statutory_registration", status: "expired", number: "DL/PT/2011/33333" }],
    fees: [1500, 1100], bookable: false, claimed: true, practiceStart: "2009-07-01",
    experiences: [{ role: "Director", org: "TEST Clinic Gamma Sports Physio", from: "2014-01-01" }],
  },
  {
    name: "TEST Meera Joshi", gender: "female", headline: "Geriatric mobility and fall prevention",
    about: "Test profile.",
    degree: ["BPT", "Maharashtra University of Health Sciences", 2007],
    specialties: ["geriatric", "home_care"], languages: ["en", "mr", "hi", "gu"], branches: ["Bandra West"],
    credentials: [{ authority: "Maharashtra State OTPT Council", type: "statutory_registration", status: "registration_checked", number: "MH/PT/2007/11111", checked: true }],
    fees: [1100, 900], bookable: true, claimed: true, practiceStart: "2007-06-01",
    experiences: [{ role: "Senior Physiotherapist", org: "TEST Clinic Beta Rehab", from: "2012-03-01" }],
  },
  {
    name: "TEST Farhan Khan", gender: "male", headline: "Vestibular rehabilitation and balance disorders",
    about: "Test profile.",
    degree: ["BPT", "Maharashtra University of Health Sciences", 2014], mpt: ["MPT (Neurology)", "Maharashtra University of Health Sciences", 2016],
    specialties: ["vestibular", "neuro"], languages: ["en", "hi", "ur", "mr"], branches: ["Bandra West"],
    credentials: [{ authority: "Maharashtra State OTPT Council", type: "statutory_registration", status: "document_reviewed", number: "MH/PT/2016/44444" }],
    fees: [1200, 1000], bookable: true, claimed: true, practiceStart: "2014-07-01",
    experiences: [{ role: "Physiotherapist", org: "TEST Clinic Beta Rehab", from: "2016-08-01" }],
  },
];

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No database URL");
  const pool = new Pool({ connectionString: url, max: 2, application_name: "thephysioindex-seed-dev" });
  const db = drizzle(pool, { schema });

  // Guard: never run against the production branch endpoint.
  if (/ep-lingering-river-azw9th51/.test(url)) {
    throw new Error("[seed-dev] refusing to seed test data into the production branch");
  }

  // Wipe previous test data in dependency order (test rows only). A test practitioner that
  // real preview activity now references (bookings, cases, claims, calendars, reviews…) is
  // kept as is and not re-seeded, so exercising those flows never breaks the next build.
  const keepSql = sql`SELECT id FROM practitioners p WHERE is_test_account AND NOT EXISTS (SELECT 1 FROM bookings x WHERE x.practitioner_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM reservations x WHERE x.practitioner_id = p.id) AND NOT EXISTS (SELECT 1 FROM availability_rules x JOIN calendar_resources cr ON cr.id = x.resource_id WHERE cr.practitioner_id = p.id AND x.created_by_user_id IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM claim_requests x WHERE x.practitioner_id = p.id) AND NOT EXISTS (SELECT 1 FROM verification_cases x WHERE x.practitioner_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM reviews x WHERE x.practitioner_id = p.id) AND NOT EXISTS (SELECT 1 FROM review_replies x WHERE x.practitioner_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM enquiries x WHERE x.practitioner_id = p.id) AND NOT EXISTS (SELECT 1 FROM offers x WHERE x.practitioner_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM resolution_tasks x WHERE x.practitioner_id = p.id) AND NOT EXISTS (SELECT 1 FROM media_assets x WHERE x.practitioner_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM portfolio_items x WHERE x.practitioner_id = p.id) AND NOT EXISTS (SELECT 1 FROM practitioner_slug_history x WHERE x.practitioner_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM import_rows x WHERE x.practitioner_id = p.id) AND NOT EXISTS (SELECT 1 FROM content_articles x WHERE x.author_practitioner_id = p.id)
    AND NOT EXISTS (SELECT 1 FROM duplicate_candidates x WHERE x.practitioner_a_id = p.id OR x.practitioner_b_id = p.id)`;
  await db.execute(sql`
    WITH tp AS (${keepSql}),
         tb AS (SELECT b.id FROM branches b JOIN clinics c ON c.id = b.clinic_id WHERE c.name LIKE 'TEST %')
    , d1 AS (DELETE FROM offering_versions WHERE offering_id IN (SELECT id FROM offerings WHERE practitioner_id IN (SELECT id FROM tp)))
    , d2 AS (DELETE FROM offerings WHERE practitioner_id IN (SELECT id FROM tp))
    , d3 AS (DELETE FROM practitioner_branches WHERE practitioner_id IN (SELECT id FROM tp))
    , d4 AS (DELETE FROM credentials WHERE practitioner_id IN (SELECT id FROM tp))
    , d5 AS (DELETE FROM qualifications WHERE practitioner_id IN (SELECT id FROM tp))
    , d6 AS (DELETE FROM experiences WHERE practitioner_id IN (SELECT id FROM tp))
    , d7 AS (DELETE FROM practitioner_specialties WHERE practitioner_id IN (SELECT id FROM tp))
    , d8 AS (DELETE FROM practitioner_languages WHERE practitioner_id IN (SELECT id FROM tp))
    , d9 AS (DELETE FROM profile_versions WHERE practitioner_id IN (SELECT id FROM tp))
    , d10 AS (UPDATE practitioners SET published_version_id = NULL WHERE id IN (SELECT id FROM tp))
    SELECT 1
  `);
  // Seeded calendars (rules without an author) are rebuilt; a calendar someone edited on the preview keeps its practitioner.
  await db.execute(sql`DELETE FROM availability_rules WHERE resource_id IN (SELECT id FROM calendar_resources WHERE practitioner_id IN (${keepSql}))`);
  await db.execute(sql`DELETE FROM schedule_exceptions WHERE resource_id IN (SELECT id FROM calendar_resources WHERE practitioner_id IN (${keepSql}))`);
  await db.execute(sql`DELETE FROM calendar_resources WHERE practitioner_id IN (${keepSql})`);
  await db.execute(sql`DELETE FROM practitioners WHERE id IN (${keepSql})`);
  const retained = await db.execute<{ display_name: string }>(sql`SELECT display_name FROM practitioners WHERE is_test_account`);
  const retainedNames = new Set(retained.rows.map((r) => r.display_name));
  if (retainedNames.size) console.log(`[seed-dev] keeping ${retainedNames.size} referenced test practitioner(s): ${[...retainedNames].join(", ")}`);
  // TEST clinics and branches are upserted by name, never deleted: real onboarding
  // flows on the preview may reference them (offerings, associations, bookings).

  // Lookups
  const stateRows = await db.select({ id: schema.states.id, code: schema.states.code }).from(schema.states);
  const stateByCode = new Map(stateRows.map((s) => [s.code, s.id]));
  const cityRows = await db.select({ id: schema.cities.id, stateId: schema.cities.stateId, slug: schema.cities.slug }).from(schema.cities);
  const cityByKey = new Map(cityRows.map((c) => [`${c.stateId}/${c.slug}`, c.id]));
  const localityRows = await db.select({ id: schema.localities.id, cityId: schema.localities.cityId, slug: schema.localities.slug }).from(schema.localities);
  const localityByKey = new Map(localityRows.map((l) => [`${l.cityId}/${l.slug}`, l.id]));
  const specRows = await db.select({ id: schema.specialties.id, code: schema.specialties.code }).from(schema.specialties);
  const specByCode = new Map(specRows.map((s) => [s.code, s.id]));
  const langRows = await db.select({ id: schema.languages.id, code: schema.languages.code }).from(schema.languages);
  const langByCode = new Map(langRows.map((l) => [l.code, l.id]));
  const svcRows = await db.select({ id: schema.services.id, code: schema.services.code }).from(schema.services);
  const svcByCode = new Map(svcRows.map((s) => [s.code, s.id]));
  const authRows = await db.select({ id: schema.credentialAuthorities.id, name: schema.credentialAuthorities.name }).from(schema.credentialAuthorities);
  const authByName = new Map(authRows.map((a) => [a.name, a.id]));
  const [policy] = await db.select({ id: schema.policies.id }).from(schema.policies).where(eq(schema.policies.type, "cancellation")).limit(1);

  // Clinics and branches
  const clinicIdByName = new Map<string, string>();
  for (const c of CLINICS) {
    const existing = await db.select({ id: schema.clinics.id }).from(schema.clinics).where(eq(schema.clinics.name, c.name)).limit(1);
    if (existing[0]) {
      await db.update(schema.clinics).set({ about: c.about, publicPhone: c.phone, status: "published" }).where(eq(schema.clinics.id, existing[0].id));
      clinicIdByName.set(c.name, existing[0].id);
      continue;
    }
    const [row] = await db
      .insert(schema.clinics)
      .values({ publicId: newPublicId(), slug: slugify(c.name), name: c.name, about: c.about, publicPhone: c.phone, status: "published" })
      .returning({ id: schema.clinics.id });
    clinicIdByName.set(c.name, row.id);
  }
  const branchIdByName = new Map<string, string>();
  const existingBranches = await db
    .select({ id: schema.branches.id, clinicId: schema.branches.clinicId, name: schema.branches.name })
    .from(schema.branches)
    .where(inArray(schema.branches.clinicId, [...clinicIdByName.values()]));
  const branchByKey = new Map(existingBranches.map((b) => [`${b.clinicId}/${b.name}`, b.id]));
  for (const b of BRANCHES) {
    const known = branchByKey.get(`${clinicIdByName.get(b.clinic)}/${b.name}`);
    if (known) {
      await db.update(schema.branches).set({ status: "published" }).where(eq(schema.branches.id, known));
      branchIdByName.set(b.name, known);
      continue;
    }
    const [stateCode, citySlugRaw] = b.city.split("/");
    const stateId = stateByCode.get(stateCode)!;
    const cityId = cityByKey.get(`${stateId}/${slugify(citySlugRaw)}`);
    if (!cityId) throw new Error(`city not found ${b.city}`);
    const localityId = localityByKey.get(`${cityId}/${slugify(b.locality)}`);
    if (!localityId) throw new Error(`locality not found ${b.locality}`);
    const [row] = await db
      .insert(schema.branches)
      .values({
        clinicId: clinicIdByName.get(b.clinic)!,
        name: b.name,
        addressLine1: `1 Test Street, ${b.locality}`,
        localityId,
        cityId,
        stateId,
        pinCode: b.pin,
        latitude: b.lat,
        longitude: b.lng,
        publicPhone: b.phone,
        status: "published",
        workingHours: { "1": [{ open: "09:00", close: "19:00" }], "2": [{ open: "09:00", close: "19:00" }], "3": [{ open: "09:00", close: "19:00" }], "4": [{ open: "09:00", close: "19:00" }], "5": [{ open: "09:00", close: "19:00" }], "6": [{ open: "09:00", close: "14:00" }] },
        facilities: ["Wheelchair access", "Parking"],
      })
      .returning({ id: schema.branches.id });
    branchIdByName.set(b.name, row.id);
  }

  // Practitioners
  let n = 0;
  for (const p of PRACTITIONERS) {
    if (retainedNames.has(p.name)) continue;
    const publicId = newPublicId();
    const [pr] = await db
      .insert(schema.practitioners)
      .values({
        publicId,
        slug: slugify(p.name),
        claimState: p.claimed ? "claimed" : "unclaimed",
        listingStatus: "published",
        bookingEligible: p.bookable,
        displayName: p.name,
        designation: "Physiotherapist",
        headline: p.headline,
        gender: p.gender,
        practiceStartDate: p.practiceStart,
        isTestAccount: true,
        publishedAt: new Date(),
        source: p.claimed ? "self_created" : "staff_created",
      })
      .returning({ id: schema.practitioners.id });
    const [pv] = await db
      .insert(schema.profileVersions)
      .values({ practitionerId: pr.id, version: 1, state: "approved", structuredContent: { about: p.about }, decidedAt: new Date() })
      .returning({ id: schema.profileVersions.id });
    await db.update(schema.practitioners).set({ publishedVersionId: pv.id }).where(eq(schema.practitioners.id, pr.id));

    await db.insert(schema.qualifications).values([
      { practitionerId: pr.id, degree: p.degree[0], institution: p.degree[1], completionYear: p.degree[2], sortOrder: 1 },
      ...(p.mpt ? [{ practitionerId: pr.id, degree: p.mpt[0], institution: p.mpt[1], completionYear: p.mpt[2], sortOrder: 0 }] : []),
    ]);
    if (p.experiences.length) {
      await db.insert(schema.experiences).values(p.experiences.map((e) => ({ practitionerId: pr.id, role: e.role, organisationName: e.org, startMonth: e.from, endMonth: e.to })));
    }
    await db.insert(schema.practitionerSpecialties).values(p.specialties.map((code, i) => ({ practitionerId: pr.id, specialtyId: specByCode.get(code)!, isPrimary: i === 0 })));
    await db.insert(schema.practitionerLanguages).values(p.languages.map((code) => ({ practitionerId: pr.id, languageId: langByCode.get(code)! })));
    for (const c of p.credentials) {
      const authorityId = authByName.get(c.authority);
      if (!authorityId) throw new Error(`authority not found ${c.authority}`);
      await db.insert(schema.credentials).values({
        practitionerId: pr.id,
        authorityId,
        type: c.type,
        numberOriginal: c.number,
        numberNormalised: c.number ? normaliseRegistrationNumber(c.number) : undefined,
        status: c.status,
        publicNumberApproved: Boolean(c.checked),
        lastCheckedAt: c.status === "registration_checked" || c.status === "document_reviewed" ? new Date() : undefined,
        scopeOfCheck: c.status === "registration_checked" ? "Name and number matched on the issuer's public register" : undefined,
        source: "seed-dev",
      });
    }
    // Calendar (BKG-07): every practitioner has one. Bookable ones get weekly hours, alternating days across branches.
    const [cal] = await db.insert(schema.calendarResources).values({ practitionerId: pr.id }).returning({ id: schema.calendarResources.id });
    if (p.bookable) {
      const rules = p.branches.flatMap((bName, i) =>
        [1, 2, 3, 4, 5, 6]
          .filter((d) => d % p.branches.length === i)
          .flatMap((weekday) => [
            { resourceId: cal.id, branchId: branchIdByName.get(bName)!, weekday, localStart: "09:00", localEnd: "13:00", scheduleVersion: 1 },
            ...(weekday === 6 ? [] : [{ resourceId: cal.id, branchId: branchIdByName.get(bName)!, weekday, localStart: "15:00", localEnd: "19:00", scheduleVersion: 1 }]),
          ]),
      );
      if (rules.length) await db.insert(schema.availabilityRules).values(rules);
    }
    for (const bName of p.branches) {
      const branchId = branchIdByName.get(bName)!;
      const [pb] = await db
        .insert(schema.practitionerBranches)
        .values({ practitionerId: pr.id, branchId, state: "approved", bookable: true })
        .returning({ id: schema.practitionerBranches.id });
      const offerings: [string, string, number][] = [
        ["initial_assessment", "Initial assessment", p.fees[0]],
        ["follow_up", "Follow-up session", p.fees[1]],
      ];
      for (const [svc, label, rupees] of offerings) {
        const [o] = await db
          .insert(schema.offerings)
          .values({ practitionerBranchId: pb.id, practitionerId: pr.id, branchId, serviceId: svcByCode.get(svc)!, displayName: label, active: true })
          .returning({ id: schema.offerings.id });
        const [ov] = await db
          .insert(schema.offeringVersions)
          .values({ offeringId: o.id, version: 1, durationMin: svc === "initial_assessment" ? 45 : 30, intervalMin: 15, bufferAfterMin: 10, basePricePaise: rupees * 100, cancellationPolicyId: policy?.id, priceNote: svc === "initial_assessment" ? "Includes examination and treatment plan" : null })
          .returning({ id: schema.offeringVersions.id });
        await db.update(schema.offerings).set({ currentVersionId: ov.id }).where(eq(schema.offerings.id, o.id));
      }
    }
    n++;
  }
  console.log(`[seed-dev] seeded ${CLINICS.length} test clinics, ${BRANCHES.length} branches, ${n} test practitioners`);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed-dev] failed", err);
  process.exit(1);
});
