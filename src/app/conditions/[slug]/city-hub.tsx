import Link from "next/link";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { citiesWithListings, conditionCityPath, listCityRefs, type ConditionRef } from "@/lib/condition-city";
import { CONDITION_NOTES } from "@/lib/content/condition-notes";
import { byCityDemand } from "@/lib/seo/condition-city-demand";

/** Cities for one condition, grouped by state, most-searched cities first inside a "popular" strip (SEO-01). */
export async function ConditionCityLinks({ condition, heading }: { condition: ConditionRef; heading: string }) {
  const [cities, listed] = await Promise.all([listCityRefs(), citiesWithListings(condition.id).catch(() => new Map<string, number>())]);
  const popular = byCityDemand(cities).slice(0, 16);
  const states = [...new Set(cities.map((c) => c.stateName))].sort((a, b) => a.localeCompare(b));
  const count = (slug: string) => (listed.get(slug) ? <span className="text-muted"> ({listed.get(slug)})</span> : null);
  return (
    <section id="cities" className="mt-10 scroll-mt-6">
      <h2 className="text-2xl font-semibold">{heading}</h2>
      <p className="mt-2 text-sm text-muted">A number beside a city is how many published physiotherapists there list {condition.label}. Cities without a number have no listing for it yet.</p>
      <ul className="mt-4 flex flex-wrap gap-2 text-sm">
        {popular.map((c) => <li key={c.slug}><Link href={conditionCityPath(condition.slug, c.slug)} className="chip px-3 py-1.5 hover:border-brand">{c.name}{count(c.slug)}</Link></li>)}
      </ul>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {states.map((st) => (
          <div key={st}>
            <h3 className="text-sm font-semibold">{st}</h3>
            <ul className="mt-1 grid gap-0.5 text-sm">
              {cities.filter((c) => c.stateName === st).map((c) => <li key={c.slug}><Link href={conditionCityPath(condition.slug, c.slug)} className="hover:underline">{c.name}</Link>{count(c.slug)}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Shown at /conditions/<condition> when there is no published guide for it yet: a directory hub, not a medical article. */
export function ConditionCityHub({ condition, siteUrl }: { condition: ConditionRef; siteUrl: string }) {
  const note = CONDITION_NOTES[condition.slug];
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs siteUrl={siteUrl} items={[{ label: "Home", href: "/" }, { label: "Conditions", href: "/conditions" }, { label: condition.label }]} />
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">{condition.label}: find a physiotherapist by city</h1>
      {note ? <p className="mt-3 max-w-2xl leading-relaxed">{note}</p> : null}
      <p className="mt-2 max-w-2xl text-sm text-muted">General information, not medical advice, and not yet clinically reviewed. Choose your city to see the physiotherapists who list {condition.label}.</p>
      <ConditionCityLinks condition={condition} heading={`${condition.label} physiotherapists by city`} />
    </div>
  );
}
