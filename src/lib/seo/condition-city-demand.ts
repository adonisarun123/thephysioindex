/**
 * Search-demand research for condition-by-city pages (SEO-01).
 *
 * Source: Google Ads Keyword Planner, The Physio Index account, India, all
 * languages, average monthly searches November 2025 to October 2026, pulled
 * 15 November 2026 (997 keywords). Used only to order links and set sitemap
 * priority; it never decides what a page says.
 *
 * CITY_DEMAND: "physiotherapist in <city>", searched by the common name of the
 * city (bangalore, gurgaon, trichy …) and stored here under our city slug.
 * Cities missing from the map returned no data. Lucknow uses "physiotherapy in
 * lucknow" because the "physiotherapist in" form returned no figure.
 */
export const CITY_DEMAND: Record<string, number> = {
  bengaluru: 5400, delhi: 5400, gurugram: 4400, hyderabad: 3600, jaipur: 3600, mumbai: 3600, pune: 3600, dehradun: 2900, noida: 2900,
  ahmedabad: 2400, indore: 2400, kolkata: 2400, patna: 2400, lucknow: 2400, bhopal: 1900, chandigarh: 1900, nagpur: 1900, faridabad: 1600,
  ranchi: 1600, thane: 1600, bathinda: 1300, chennai: 1300, ghaziabad: 1300, gwalior: 1300, jodhpur: 1300, ludhiana: 1300, surat: 1300,
  vadodara: 1300, "greater-noida": 1000, nashik: 1000, coimbatore: 880, gandhinagar: 880, meerut: 880, panchkula: 880,
  "chhatrapati-sambhajinagar": 720, kochi: 720, madurai: 720, mangaluru: 720, udaipur: 720, vijayawada: 720, visakhapatnam: 720, ajmer: 590,
  patiala: 590, salem: 590, guwahati: 480, "navi-mumbai": 480, varanasi: 480, agra: 390, berhampur: 390, dhanbad: 390, howrah: 390,
  jabalpur: 390, kannur: 390, kanpur: 390, kurnool: 390, mohali: 390, muzaffarpur: 390, puducherry: 390, raipur: 390, bhubaneswar: 320,
  gorakhpur: 320, mysuru: 320, tiruchirappalli: 320, bareilly: 260, kolhapur: 260, siliguri: 260, prayagraj: 210, bilaspur: 210, gaya: 210,
  haldwani: 210, jalandhar: 210, karnal: 210, bhagalpur: 170, durgapur: 170, hosur: 170, jammu: 170, kakinada: 170, kota: 170, rajkot: 170,
  rishikesh: 170, rohtak: 170, silchar: 170, agartala: 140, amravati: 140, "bokaro-steel-city": 140, kalaburagi: 140, haridwar: 140, hisar: 140,
  solapur: 140, tirupati: 140, asansol: 110, belagavi: 110, cuttack: 110, dibrugarh: 110, erode: 110, hubballi: 110, jamshedpur: 110,
  karimnagar: 110, shimla: 110, ujjain: 110, bhilai: 90, margao: 90, nellore: 90, rourkela: 90, shillong: 90, srinagar: 90, thrissur: 90,
  tirunelveli: 90, vellore: 90, rajamahendravaram: 70, warangal: 70, ambala: 50, bhavnagar: 50, kottayam: 50, dimapur: 30, silvassa: 30,
  thoothukudi: 30, dharamshala: 20, gangtok: 10,
};

/**
 * Per condition: `cityModified` is the sum of "<condition> treatment in <city>"
 * across the 20 highest-demand cities (780 phrases, 115 with any data, 3,320
 * searches a month in total); `national` is the larger of "<condition>
 * treatment" and "<condition> physiotherapy" with no city. 0 = no data returned.
 */
export const CONDITION_DEMAND: Record<string, { cityModified: number; national: number }> = {
  sciatica: { cityModified: 980, national: 40500 },
  "knee-pain": { cityModified: 380, national: 18100 },
  "frozen-shoulder": { cityModified: 310, national: 14800 },
  "slipped-disc": { cityModified: 260, national: 5400 },
  arthritis: { cityModified: 240, national: 18100 },
  "neck-pain": { cityModified: 230, national: 12100 },
  "parkinsons-disease": { cityModified: 190, national: 12100 },
  "low-back-pain": { cityModified: 180, national: 18100 },
  "vertigo-and-bppv": { cityModified: 160, national: 12100 },
  "cervical-spondylosis": { cityModified: 120, national: 12100 },
  "cerebral-palsy": { cityModified: 60, national: 14800 },
  "shoulder-pain": { cityModified: 60, national: 2900 },
  "sports-injury": { cityModified: 50, national: 260 },
  "heel-pain": { cityModified: 30, national: 9900 },
  "hip-pain": { cityModified: 20, national: 1300 },
  "ankle-sprain": { cityModified: 10, national: 4400 },
  "lumbar-spondylosis": { cityModified: 10, national: 2900 },
  "spinal-cord-injury": { cityModified: 10, national: 1300 },
  "stroke-rehabilitation": { cityModified: 10, national: 480 },
  "tennis-elbow": { cityModified: 10, national: 12100 },
  "plantar-fasciitis": { cityModified: 0, national: 33100 },
  "carpal-tunnel-syndrome": { cityModified: 0, national: 12100 },
  "bells-palsy": { cityModified: 0, national: 9900 },
  "breathing-and-chest-physiotherapy": { cityModified: 0, national: 8100 },
  "muscle-strain": { cityModified: 0, national: 6600 },
  "meniscus-injury": { cityModified: 0, national: 2900 },
  "acl-and-ligament-injury": { cityModified: 0, national: 1900 },
  "knee-osteoarthritis": { cityModified: 0, national: 1900 },
  "pelvic-floor-weakness": { cityModified: 0, national: 1600 },
  "headache-and-jaw-pain": { cityModified: 0, national: 590 },
  scoliosis: { cityModified: 0, national: 320 },
  "knee-replacement-rehabilitation": { cityModified: 0, national: 260 },
  "posture-related-pain": { cityModified: 0, national: 170 },
  "developmental-delay-in-children": { cityModified: 0, national: 110 },
  "hip-replacement-rehabilitation": { cityModified: 0, national: 110 },
  "balance-problems-and-falls": { cityModified: 0, national: 90 },
  "fracture-rehabilitation": { cityModified: 0, national: 70 },
  "rotator-cuff-injury": { cityModified: 0, national: 0 },
  "pregnancy-and-postnatal-back-pain": { cityModified: 0, national: 0 },
};

export function cityDemand(citySlug: string): number {
  return CITY_DEMAND[citySlug] ?? 0;
}

/** City-modified demand first (it is the direct evidence for this page type), national demand as the tie-breaker. */
export function conditionScore(conditionSlug: string): number {
  const d = CONDITION_DEMAND[conditionSlug];
  return d ? d.cityModified * 1000 + d.national : 0;
}

export function byCityDemand<T extends { slug: string; name: string }>(cities: T[]): T[] {
  return [...cities].sort((a, b) => cityDemand(b.slug) - cityDemand(a.slug) || a.name.localeCompare(b.name));
}

export function byConditionDemand<T extends { slug: string; label: string }>(conditions: T[]): T[] {
  return [...conditions].sort((a, b) => conditionScore(b.slug) - conditionScore(a.slug) || a.label.localeCompare(b.label));
}

/** Sitemap priority 0.3 to 0.8 from the two demand tiers. */
export function sitemapPriority(conditionSlug: string, citySlug: string): number {
  const c = cityDemand(citySlug);
  const cityTier = c >= 3000 ? 3 : c >= 1000 ? 2 : c >= 300 ? 1 : 0;
  const m = CONDITION_DEMAND[conditionSlug]?.cityModified ?? 0;
  const conditionTier = m >= 200 ? 2 : m > 0 ? 1 : 0;
  return Math.round((0.3 + 0.1 * (cityTier + conditionTier)) * 10) / 10;
}
