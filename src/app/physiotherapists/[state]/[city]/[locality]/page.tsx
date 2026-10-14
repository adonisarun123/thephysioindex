import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DirectoryResults, filtersFromSearchParams, type RawSearchParams } from "@/components/directory-results";
import { searchPractitioners } from "@/lib/directory";
import { getCityBySlug, getLocalityBySlug, getStateBySlug } from "@/lib/geo";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

export async function generateMetadata({ params }: PageProps<"/physiotherapists/[state]/[city]/[locality]">): Promise<Metadata> {
  const p = await params;
  const state = await getStateBySlug(p.state);
  const city = state ? await getCityBySlug(state.id, p.city) : null;
  const locality = city ? await getLocalityBySlug(city.id, p.locality) : null;
  if (!state || !city || !locality) return { title: "Not found" };
  const { total } = await searchPractitioners({ stateSlug: state.slug, citySlug: city.slug, localitySlug: locality.slug, limit: 1 });
  return {
    title: `Physiotherapists in ${locality.name}, ${city.name}`,
    description: `Physiotherapists in ${locality.name}, ${city.name}. Compare qualifications, fees and availability and book a clinic visit.`,
    alternates: { canonical: `/physiotherapists/${state.slug}/${city.slug}/${locality.slug}` },
    // Empty location pages are noindexed until approved profiles exist (SEO-02).
    robots: total > 0 ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default function Page({ params, searchParams }: PageProps<"/physiotherapists/[state]/[city]/[locality]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 text-muted">Loading…</div>}>
      <LocalityPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function LocalityPage({ params, searchParams }: { params: PageProps<"/physiotherapists/[state]/[city]/[locality]">["params"]; searchParams: PageProps<"/physiotherapists/[state]/[city]/[locality]">["searchParams"] }) {
  const [{ state: stateSlug, city: citySlug, locality: localitySlug }, sp] = await Promise.all([params, searchParams]);
  await connection();
  const state = await getStateBySlug(stateSlug);
  if (!state) notFound();
  const city = await getCityBySlug(state.id, citySlug);
  if (!city) notFound();
  const locality = await getLocalityBySlug(city.id, localitySlug);
  if (!locality) notFound();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs
        siteUrl={siteUrl}
        items={[
          { label: "Home", href: "/" },
          { label: "Physiotherapists", href: "/physiotherapists" },
          { label: state.name, href: `/physiotherapists/${state.slug}` },
          { label: city.name, href: `/physiotherapists/${state.slug}/${city.slug}` },
          { label: locality.name },
        ]}
      />
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Physiotherapists in {locality.name}, {city.name}
      </h1>
      <DirectoryResults
        filters={filtersFromSearchParams(sp as RawSearchParams, { stateSlug: state.slug, citySlug: city.slug, localitySlug: locality.slug })}
        basePath={`/physiotherapists/${state.slug}/${city.slug}/${locality.slug}`}
        scopeLabel={`${locality.name}, ${city.name}`}
        broaderHref={`/physiotherapists/${state.slug}/${city.slug}`}
        broaderLabel={`all of ${city.name}`}
      />
    </div>
  );
}
