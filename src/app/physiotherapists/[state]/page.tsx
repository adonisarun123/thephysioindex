import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EmptyCoverage } from "@/components/empty-coverage";
import { getStateBySlug, listCities } from "@/lib/geo";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

export async function generateMetadata({ params }: PageProps<"/physiotherapists/[state]">): Promise<Metadata> {
  const { state: slug } = await params;
  const state = await getStateBySlug(slug);
  if (!state) return { title: "Not found" };
  return {
    title: `Physiotherapists in ${state.name}`,
    description: `Find reviewed physiotherapists in ${state.name} by city and locality. Compare qualifications, fees and availability.`,
    alternates: { canonical: `/physiotherapists/${state.slug}` },
  };
}

export default function Page({ params }: PageProps<"/physiotherapists/[state]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 text-muted">Loading…</div>}>
      <StatePage params={params} />
    </Suspense>
  );
}

async function StatePage({ params }: { params: PageProps<"/physiotherapists/[state]">["params"] }) {
  const { state: slug } = await params;
  await connection();
  const state = await getStateBySlug(slug);
  if (!state) notFound();
  const cities = await listCities(state.id);
  const kindLabel = state.kind === "union_territory" ? "union territory" : "state";
  const totalPractitioners = cities.reduce((n, c) => n + c.publishedPractitionerCount, 0);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs siteUrl={siteUrl} items={[{ label: "Home", href: "/" }, { label: "Physiotherapists", href: "/physiotherapists" }, { label: state.name }]} />
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Physiotherapists in {state.name}</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Choose a city in this {kindLabel}. {totalPractitioners > 0 ? `${totalPractitioners} published physiotherapists so far.` : "Listings are being onboarded city by city."}
      </p>
      {cities.length === 0 ? (
        <EmptyCoverage scope={state.name} backHref="/physiotherapists" backLabel="all states" />
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {cities.map((c) => (
            <li key={c.id}>
              <Link href={`/physiotherapists/${state.slug}/${c.slug}`} className="block rounded-md border border-line bg-surface px-3 py-2 hover:border-brand">
                <span className="font-medium">{c.name}</span>
                <span className="block text-xs text-muted">
                  {c.publishedPractitionerCount > 0 ? `${c.publishedPractitionerCount} physiotherapists` : c.localityCount > 0 ? `${c.localityCount} localities` : "Onboarding"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
