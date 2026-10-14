import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SearchForm } from "@/components/search-form";
import { listStates, resolvePlace } from "@/lib/geo";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

export const metadata: Metadata = {
  title: "Physiotherapists in India by state and city",
  description: "Browse reviewed physiotherapist listings across every Indian state and union territory.",
  alternates: { canonical: "/physiotherapists" },
};

export default function Page({ searchParams }: PageProps<"/physiotherapists">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs siteUrl={siteUrl} items={[{ label: "Home", href: "/" }, { label: "Physiotherapists" }]} />
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Physiotherapists in India</h1>
      <p className="mt-2 max-w-2xl text-muted">Choose a state or union territory, then a city and locality. Only reviewed, published profiles appear in results.</p>
      <Suspense fallback={<div className="mt-6 max-w-2xl"><SearchForm /></div>}>
        <SearchSection searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<p className="mt-8 text-muted">Loading states…</p>}>
        <StateList />
      </Suspense>
    </div>
  );
}

async function SearchSection({ searchParams }: { searchParams: PageProps<"/physiotherapists">["searchParams"] }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  return (
    <>
      <div className="mt-6 max-w-2xl">
        <SearchForm defaultQuery={q} />
      </div>
      {q ? <PlaceResults q={q} /> : null}
    </>
  );
}

async function PlaceResults({ q }: { q: string }) {
  await connection();
  const matches = await resolvePlace(q);
  if (matches.length === 1) redirect(matches[0].path);
  if (matches.length === 0) {
    return (
      <div className="mt-6 card p-4">
        <p className="font-medium">No place matched “{q}”.</p>
        <p className="mt-1 text-sm text-muted">Try a city name such as Bengaluru or Pune, or pick a state below. Practitioner-name search arrives with the directory release.</p>
      </div>
    );
  }
  return (
    <div className="mt-6 card p-4">
      <p className="font-medium">Did you mean…</p>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {matches.map((m) => (
          <li key={`${m.type}:${m.id}`}>
            <Link href={m.path} className="underline">{m.name}</Link>
            <span className="text-sm text-muted"> — {m.type === "state" ? (m.context === "union_territory" ? "union territory" : "state") : m.context}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function StateList() {
  await connection();
  const states = await listStates();
  const groups = [
    { label: "States", items: states.filter((s) => s.kind === "state") },
    { label: "Union territories", items: states.filter((s) => s.kind === "union_territory") },
  ];
  return (
    <div className="mt-8 grid gap-8">
      {groups.map((g) => (
        <section key={g.label}>
          <h2 className="text-lg font-semibold">{g.label}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {g.items.map((s) => (
              <li key={s.id}>
                <Link href={`/physiotherapists/${s.slug}`} className="block card block px-4 py-3 hover:border-brand">
                  <span className="font-medium">{s.name}</span>
                  <span className="block text-xs text-muted">{s.cityCount} {s.cityCount === 1 ? "city" : "cities"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
