import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ConditionGroups, LETTERS, LetterStrip, letterOf } from "@/components/content/conditions-az";
import { listAllPublished } from "@/lib/content/public";
import { indexDecision, robotsFor } from "@/lib/seo/gate";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

function parseLetter(raw: string): string | null {
  const l = raw.toUpperCase();
  return LETTERS.includes(l) ? l : null;
}

/** Letter pages are indexable only when they list something (SEO-02). */
export async function generateMetadata({ params }: PageProps<"/conditions/browse/[letter]">): Promise<Metadata> {
  const { letter: raw } = await params;
  const letter = parseLetter(raw);
  if (!letter) return { title: "Not found", robots: { index: false, follow: false } };
  const items = (await listAllPublished("condition").catch(() => [])).filter((a) => letterOf(a.title) === letter);
  const d = await indexDecision(`/conditions/browse/${letter.toLowerCase()}`, { hasContent: items.length > 0 });
  return {
    title: `Conditions starting with ${letter}`,
    description: `Physiotherapy condition guides starting with ${letter}: ${items.slice(0, 5).map((a) => a.title).join(", ")}.`,
    alternates: { canonical: `/conditions/browse/${letter.toLowerCase()}` },
    robots: robotsFor(d),
  };
}

export default function Page({ params }: PageProps<"/conditions/browse/[letter]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 text-muted">Loading…</div>}>
      <Letter params={params} />
    </Suspense>
  );
}

async function Letter({ params }: { params: PageProps<"/conditions/browse/[letter]">["params"] }) {
  const { letter: raw } = await params;
  const letter = parseLetter(raw);
  if (!letter) notFound();
  await connection();
  const all = await listAllPublished("condition");
  const counts: Record<string, number> = {};
  for (const a of all) counts[letterOf(a.title)] = (counts[letterOf(a.title)] ?? 0) + 1;
  const items = all.filter((a) => letterOf(a.title) === letter);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs siteUrl={siteUrl} items={[{ label: "Home", href: "/" }, { label: "Conditions", href: "/conditions" }, { label: letter }]} />
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Conditions starting with {letter}</h1>
      <LetterStrip counts={counts} active={letter} />
      {items.length ? (
        <ConditionGroups items={items} />
      ) : (
        <div className="mt-6 card border-dashed p-6">
          <p className="font-medium">No condition guides under {letter} yet.</p>
          <p className="mt-1 text-sm text-muted">
            Browse the <Link href="/conditions" className="underline">full A to Z</Link> instead.
          </p>
        </div>
      )}
    </div>
  );
}
