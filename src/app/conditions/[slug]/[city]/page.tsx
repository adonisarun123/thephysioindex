import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { PractitionerCardRow } from "@/components/practitioner-card";
import { conditionCityPath, getCityFacts, getCityRef, getConditionBySlug, indexEmptyPages, listCityRefs, listConditions, type CityFacts, type CityRef, type ConditionRef } from "@/lib/condition-city";
import { CONDITION_NOTES } from "@/lib/content/condition-notes";
import { getPublished } from "@/lib/content/public";
import { searchPractitioners, type PractitionerCard } from "@/lib/directory";
import { formatPaise } from "@/lib/money";
import { byCityDemand, byConditionDemand } from "@/lib/seo/condition-city-demand";
import { indexDecision, robotsFor } from "@/lib/seo/gate";
import { ldJson, practitionerItemListJsonLd } from "@/lib/seo/jsonld";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";
const LIST_LIMIT = 20;

type Props = PageProps<"/conditions/[slug]/[city]">;

async function load(conditionSlug: string, citySlug: string) {
  const [condition, city] = await Promise.all([getConditionBySlug(conditionSlug), getCityRef(citySlug)]);
  if (!condition || !city) return null;
  const treating = await searchPractitioners({ conditionSlug: condition.slug, citySlug: city.slug, stateSlug: city.stateSlug, limit: LIST_LIMIT });
  return { condition, city, treating };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, city: citySlug } = await params;
  const data = await load(slug, citySlug).catch(() => null);
  if (!data) return { title: "Page not found", robots: { index: false, follow: false } };
  const { condition, city, treating } = data;
  const path = conditionCityPath(condition.slug, city.slug);
  // Owner decision 15 Nov 2026: indexable without listings; platform_config holds the off-switch (SEO-02).
  const d = await indexDecision(path, { hasContent: treating.total > 0 || (await indexEmptyPages()) });
  const title = `${condition.label}: physiotherapists in ${city.name}`;
  const description = treating.total > 0
    ? `${treating.total} physiotherapist${treating.total === 1 ? "" : "s"} in ${city.name} list ${condition.label} among the conditions they treat. See fees, areas covered and open times, and request an appointment.`
    : `Find a physiotherapist for ${condition.label} in ${city.name}, ${city.stateName}. See who is listed, how registrations are checked and which localities are covered.`;
  return { title, description, alternates: { canonical: path }, robots: robotsFor(d), openGraph: { title, description, url: path, type: "website" } };
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 text-muted">Loading…</div>}>
      <ConditionCity params={params} />
    </Suspense>
  );
}

async function ConditionCity({ params }: { params: Props["params"] }) {
  const { slug, city: citySlug } = await params;
  await connection();
  const data = await load(slug, citySlug);
  if (!data) notFound();
  const { condition, city, treating } = data;
  const path = conditionCityPath(condition.slug, city.slug);
  const cityPath = `/physiotherapists/${city.stateSlug}/${city.slug}`;
  const [facts, others, conditions, cities, guide] = await Promise.all([
    getCityFacts(city),
    // When nobody in the city lists this condition, show who is published there, clearly labelled as such.
    treating.total === 0 ? searchPractitioners({ citySlug: city.slug, stateSlug: city.stateSlug, limit: 6 }).then((r) => r.items).catch((): PractitionerCard[] => []) : Promise.resolve([] as PractitionerCard[]),
    listConditions(),
    listCityRefs(),
    getPublished("condition", condition.slug).catch(() => null),
  ]);
  const note = CONDITION_NOTES[condition.slug];
  const sameArea = byConditionDemand(conditions.filter((c) => c.bodyArea === condition.bodyArea && c.slug !== condition.slug));
  const otherAreas = byConditionDemand(conditions.filter((c) => c.bodyArea !== condition.bodyArea)).slice(0, 12);
  const sameState = byCityDemand(cities.filter((c) => c.stateId === city.stateId && c.slug !== city.slug));
  const majorCities = byCityDemand(cities.filter((c) => c.stateId !== city.stateId)).slice(0, 12);
  const ld = treating.total > 0
    ? practitionerItemListJsonLd({ siteUrl, pagePath: path, name: `Physiotherapists for ${condition.label} in ${city.name}`, total: treating.total, items: treating.items.map((c) => ({ path: c.path, displayName: c.displayName })) })
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {ld ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(ld) }} /> : null}
      <Breadcrumbs siteUrl={siteUrl} items={[{ label: "Home", href: "/" }, { label: "Conditions", href: "/conditions" }, { label: condition.label, href: `/conditions/${condition.slug}` }, { label: city.name }]} />
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{condition.label}: physiotherapists in {city.name}</h1>
      <p className="mt-2 max-w-2xl text-muted">{lede(condition, city, treating.total, facts)}</p>

      <section className="mt-6" aria-labelledby="list-h">
        <h2 id="list-h" className="text-xl font-semibold">
          {treating.total > 0 ? `Physiotherapists who treat ${condition.label} in ${city.name}` : others.length ? `Physiotherapists published in ${city.name}` : `No listing in ${city.name} yet`}
        </h2>
        {treating.total > 0 ? (
          <>
            <p className="mt-1 text-sm text-muted">Each one ticked {condition.label} as a condition they treat, and our team saw that list when it reviewed the profile. A listing shows the checks we performed, not treatment results.</p>
            <ul className="mt-2">{treating.items.map((c) => <PractitionerCardRow key={c.id} card={c} />)}</ul>
            {treating.total > treating.items.length ? <p className="mt-3 text-sm"><Link href={`${cityPath}?q=${encodeURIComponent(condition.label)}`} className="underline">See all {treating.total}</Link></p> : null}
          </>
        ) : others.length ? (
          <>
            <p className="mt-1 text-sm text-muted">None of them has listed {condition.label} yet, so ask before you book whether they treat it.</p>
            <ul className="mt-2">{others.map((c) => <PractitionerCardRow key={c.id} card={c} />)}</ul>
            <p className="mt-3 text-sm"><Link href={cityPath} className="underline">All physiotherapists in {city.name}</Link></p>
          </>
        ) : (
          <div className="card mt-3 border-dashed p-6">
            <p className="font-medium">No physiotherapist is listed in {city.name} yet.</p>
            <p className="mt-1 text-sm text-muted">
              We publish a profile only after the physiotherapist registers and our team reviews it, so this page stays empty until one does.
              {sameState.length ? <> You can check <Link href={`/physiotherapists/${city.stateSlug}`} className="underline">other cities in {city.stateName}</Link>.</> : null}
            </p>
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="about-h">
          <h2 id="about-h" className="text-xl font-semibold">About {condition.label}</h2>
          {note ? <p className="mt-2 leading-relaxed">{note}</p> : null}
          <p className="mt-2 leading-relaxed">At a first visit a physiotherapist asks how the problem started, checks movement and strength, and explains what they found before suggesting treatment and exercises to do at home.</p>
          <p className="mt-2 text-sm text-muted">General information, not medical advice, and not yet clinically reviewed. See a doctor urgently for severe or sudden symptoms.</p>
          {guide ? <p className="mt-2 text-sm"><Link href={guide.path} className="underline">Read our guide to {guide.title}</Link></p> : null}
        </section>

        <section aria-labelledby="city-h">
          <h2 id="city-h" className="text-xl font-semibold">Physiotherapy in {city.name}</h2>
          <ul className="mt-2 grid gap-2 leading-relaxed">
            <li>{facts.physios > 0 ? `${facts.physios} physiotherapist${facts.physios === 1 ? " is" : "s are"} published in ${city.name} on The Physio Index${facts.homeVisitPhysios ? `; ${facts.homeVisitPhysios} offer${facts.homeVisitPhysios === 1 ? "s" : ""} home visits` : ""}${facts.clinicPhysios ? `; ${facts.clinicPhysios} see${facts.clinicPhysios === 1 ? "s" : ""} patients at a clinic` : ""}.` : `No physiotherapist in ${city.name} has a published profile yet.`}</li>
            {facts.feeMinPaise != null ? (
              <li>Published session fees in {city.name} start from {formatPaise(facts.feeMinPaise)}{facts.feeMaxPaise != null && facts.feeMaxPaise !== facts.feeMinPaise ? `, and the highest starting fee is ${formatPaise(facts.feeMaxPaise)}` : ""}. Each physiotherapist sets their own fees.</li>
            ) : null}
            <li>{facts.regulator ? `Physiotherapists practising in ${city.stateName} register with the ${facts.regulator}. ` : ""}Every profile shows which registration the physiotherapist gave and whether we checked it.</li>
            {facts.localityCount > 0 ? <li>We cover {facts.localityCount} localit{facts.localityCount === 1 ? "y" : "ies"} in {city.name}.</li> : null}
          </ul>
          {facts.localities.length ? (
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              {facts.localities.map((l) => <li key={l.slug}><Link href={`${cityPath}/${l.slug}`} className="chip px-3 py-1 hover:border-brand">{l.name}</Link></li>)}
              {facts.localityCount > facts.localities.length ? <li><Link href={cityPath} className="underline">All localities</Link></li> : null}
            </ul>
          ) : null}
        </section>
      </div>

      <section className="mt-10" aria-labelledby="how-h">
        <h2 id="how-h" className="text-xl font-semibold">How to see a physiotherapist through The Physio Index</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ["Open a profile", "Check the registration we verified, the fees and the areas covered."],
            ["Pick a time or send an enquiry", "Where a physiotherapist has published open times you can request one; otherwise send a short enquiry."],
            ["They confirm with you", "Nothing is booked until the physiotherapist confirms. Fees are paid to them directly."],
          ].map(([t, d], i) => (
            <li key={t} className="card p-4"><p className="text-sm font-semibold text-brand-ink">Step {i + 1}</p><p className="mt-1 font-medium">{t}</p><p className="mt-1 text-sm text-muted">{d}</p></li>
          ))}
        </ol>
      </section>

      <section className="mt-10 card p-5">
        <h2 className="text-lg font-semibold">Do you treat {condition.label} in {city.name}?</h2>
        <p className="mt-1 text-sm text-muted">List your practice free. Your profile appears on this page once you tick the condition and our team has reviewed your registration.</p>
        <Link href="/for-physiotherapists/join" className="btn btn-primary mt-3">Register as a physiotherapist</Link>
      </section>

      <LinkGrid title={`Other ${condition.bodyArea.toLowerCase()} conditions in ${city.name}`} items={sameArea.map((c) => ({ href: conditionCityPath(c.slug, city.slug), label: c.label }))} />
      <LinkGrid title={`More conditions in ${city.name}`} items={otherAreas.map((c) => ({ href: conditionCityPath(c.slug, city.slug), label: c.label }))} />
      <LinkGrid title={`${condition.label} in other cities in ${city.stateName}`} items={sameState.map((c) => ({ href: conditionCityPath(condition.slug, c.slug), label: c.name }))} />
      <LinkGrid title={`${condition.label} in other major cities`} items={majorCities.map((c) => ({ href: conditionCityPath(condition.slug, c.slug), label: c.name }))} more={{ href: `/conditions/${condition.slug}`, label: "All cities" }} />
    </div>
  );
}

function lede(condition: ConditionRef, city: CityRef, treating: number, facts: CityFacts): string {
  if (treating > 0) return `${treating} physiotherapist${treating === 1 ? "" : "s"} in ${city.name}, ${city.stateName} list${treating === 1 ? "s" : ""} ${condition.label} among the conditions they treat.`;
  if (facts.physios > 0) return `No physiotherapist in ${city.name} has listed ${condition.label} yet. ${facts.physios} ${facts.physios === 1 ? "is" : "are"} published in the city.`;
  return `We do not have a physiotherapist listed in ${city.name}, ${city.stateName} yet. This page shows them as soon as one registers and passes review.`;
}

function LinkGrid({ title, items, more }: { title: string; items: { href: string; label: string }[]; more?: { href: string; label: string } }) {
  if (!items.length) return null;
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((i) => <li key={i.href}><Link href={i.href} className="block rounded-md px-2 py-1.5 text-sm hover:bg-brand-soft">{i.label}</Link></li>)}
      </ul>
      {more ? <p className="mt-2 text-sm"><Link href={more.href} className="underline">{more.label}</Link></p> : null}
    </section>
  );
}
