import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EmptyContent } from "@/components/content/article-parts";
import { ConditionGroups, LetterStrip, letterOf } from "@/components/content/conditions-az";
import { HUB_INDEX_THRESHOLD, countPublished, listAllPublished } from "@/lib/content/public";
import Link from "next/link";
import { indexEmptyPages, listConditions } from "@/lib/condition-city";
import { byConditionDemand } from "@/lib/seo/condition-city-demand";
import { indexDecision, robotsFor } from "@/lib/seo/gate";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

/** Conditions A–Z hub (SEO-01, SEO-02). */
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const n = await countPublished("condition").catch(() => 0);
  // The by-city directory below gives the hub content even before enough guides are published (SEO-02).
  const d = await indexDecision("/conditions", { hasContent: n >= HUB_INDEX_THRESHOLD || (await indexEmptyPages()) });
  return {
    title: "Conditions physiotherapy can help with, A to Z",
    description: "Plain-language condition guides: symptoms, common causes, when to seek help, how physiotherapy helps and red flags. Reviewed by qualified physiotherapists.",
    alternates: { canonical: "/conditions" },
    robots: robotsFor(d),
  };
}

export default function Page() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs siteUrl={siteUrl} items={[{ label: "Home", href: "/" }, { label: "Conditions" }]} />
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Conditions, A to Z</h1>
      <p className="mt-2 max-w-2xl text-muted">
        What each condition is, what usually causes it, when to seek help and how physiotherapy fits in. Every page carries a clear note on whether it has been clinically reviewed.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">Loading conditions…</p>}>
        <Hub />
      </Suspense>
    </div>
  );
}

async function Hub() {
  await connection();
  const items = await listAllPublished("condition");
  const counts: Record<string, number> = {};
  for (const a of items) counts[letterOf(a.title)] = (counts[letterOf(a.title)] ?? 0) + 1;
  const vocabulary = await listConditions().catch(() => []);
  const areas = [...new Set(vocabulary.map((c) => c.bodyArea))];
  return (
    <>
      {items.length ? (
        <>
          <LetterStrip counts={counts} />
          <ConditionGroups items={items} />
        </>
      ) : vocabulary.length ? null : (
        <EmptyContent what="condition guides" />
      )}
      {vocabulary.length ? (
        <section className="mt-10">
          <h2 className="text-2xl font-semibold">Find a physiotherapist by condition</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">Choose a condition, then your city, to see the physiotherapists who list it.</p>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((area) => (
              <div key={area}>
                <h3 className="text-sm font-semibold">{area}</h3>
                <ul className="mt-1 grid gap-0.5 text-sm">
                  {byConditionDemand(vocabulary.filter((c) => c.bodyArea === area)).map((c) => (
                    <li key={c.slug}><Link href={`/conditions/${c.slug}`} className="hover:underline">{c.label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
