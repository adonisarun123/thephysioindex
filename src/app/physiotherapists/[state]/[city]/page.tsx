import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DirectoryResults, filtersFromSearchParams, type RawSearchParams } from "@/components/directory-results";
import { getCityBySlug, getStateBySlug, listLocalities } from "@/lib/geo";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

export async function generateMetadata({ params }: PageProps<"/physiotherapists/[state]/[city]">): Promise<Metadata> {
  const { state: stateSlug, city: citySlug } = await params;
  const state = await getStateBySlug(stateSlug);
  const city = state ? await getCityBySlug(state.id, citySlug) : null;
  if (!state || !city) return { title: "Not found" };
  return {
    title: `Physiotherapists in ${city.name}, ${state.name}`,
    description: `Reviewed physiotherapists in ${city.name}. Browse by locality, compare fees and book a clinic appointment.`,
    alternates: { canonical: `/physiotherapists/${state.slug}/${city.slug}` },
  };
}

export default function Page({ params, searchParams }: PageProps<"/physiotherapists/[state]/[city]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 text-muted">Loading…</div>}>
      <CityPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CityPage({ params, searchParams }: { params: PageProps<"/physiotherapists/[state]/[city]">["params"]; searchParams: PageProps<"/physiotherapists/[state]/[city]">["searchParams"] }) {
  const [{ state: stateSlug, city: citySlug }, sp] = await Promise.all([params, searchParams]);
  await connection();
  const state = await getStateBySlug(stateSlug);
  if (!state) notFound();
  const city = await getCityBySlug(state.id, citySlug);
  if (!city) notFound();
  const localities = await listLocalities(city.id);
  const total = localities.reduce((n, l) => n + l.publishedPractitionerCount, 0);
  const basePath = `/physiotherapists/${state.slug}/${city.slug}`;
  const filters = filtersFromSearchParams(sp as RawSearchParams, { stateSlug: state.slug, citySlug: city.slug });
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs
        siteUrl={siteUrl}
        items={[
          { label: "Home", href: "/" },
          { label: "Physiotherapists", href: "/physiotherapists" },
          { label: state.name, href: `/physiotherapists/${state.slug}` },
          { label: city.name },
        ]}
      />
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Physiotherapists in {city.name}</h1>
      <p className="mt-2 max-w-2xl text-muted">
        {total > 0 ? `${total} published physiotherapists across ${localities.length} localities.` : `Listings in ${city.name} are being onboarded. Pick a locality to see what is published there.`}
      </p>
      <DirectoryResults filters={filters} basePath={basePath} scopeLabel={city.name} broaderHref={`/physiotherapists/${state.slug}`} broaderLabel={state.name} />
      {localities.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-lg font-semibold">Localities in {city.name}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {localities.map((l) => (
              <li key={l.id}>
                <Link href={`/physiotherapists/${state.slug}/${city.slug}/${l.slug}`} className="block rounded-md px-2 py-1.5 text-sm hover:bg-brand-soft">
                  {l.name}
                  {l.publishedPractitionerCount > 0 ? <span className="text-muted"> ({l.publishedPractitionerCount})</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
