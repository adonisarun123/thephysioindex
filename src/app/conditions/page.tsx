import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { EmptyContent } from "@/components/content/article-parts";
import { ConditionGroups, LetterStrip, letterOf } from "@/components/content/conditions-az";
import { HUB_INDEX_THRESHOLD, countPublished, listAllPublished } from "@/lib/content/public";
import { indexDecision, robotsFor } from "@/lib/seo/gate";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

/** Conditions A–Z hub (SEO-01, SEO-02). */
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const n = await countPublished("condition").catch(() => 0);
  const d = await indexDecision("/conditions", { hasContent: n >= HUB_INDEX_THRESHOLD });
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
  if (!items.length) return <EmptyContent what="condition guides" />;
  return (
    <>
      <LetterStrip counts={counts} />
      <ConditionGroups items={items} />
    </>
  );
}
