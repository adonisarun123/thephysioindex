import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ArticleCard, EmptyContent, Pagination } from "@/components/content/article-parts";
import { HUB_INDEX_THRESHOLD, countPublished, listFacets, listPublished } from "@/lib/content/public";
import { indexDecision, robotsFor } from "@/lib/seo/gate";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

/** Guides hub (SEO-01, SEO-02): noindex until it carries enough published items; filter combinations are never indexed. */
export async function generateMetadata({ searchParams }: PageProps<"/blog">): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = Boolean(sp.specialty || sp.tag || (sp.page && sp.page !== "1"));
  const n = await countPublished("blog").catch(() => 0);
  const d = await indexDecision("/blog", { hasContent: n >= HUB_INDEX_THRESHOLD && !filtered });
  return {
    title: "Physiotherapy guides for patients in India",
    description: "Plain-language guides on recovery, exercise and when to see a physiotherapist. Clinical claims are reviewed by qualified physiotherapists before publication.",
    alternates: { canonical: "/blog" },
    robots: robotsFor(d),
  };
}

export default function Page({ searchParams }: PageProps<"/blog">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs siteUrl={siteUrl} items={[{ label: "Home", href: "/" }, { label: "Guides" }]} />
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Physiotherapy guides</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Practical, plain-language reading on recovery, movement and when to seek help. Each guide states whether a qualified physiotherapist has reviewed it.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">Loading guides…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/blog">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const specialty = typeof sp.specialty === "string" ? sp.specialty : undefined;
  const tag = typeof sp.tag === "string" ? sp.tag : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ items, pages, total }, facets] = await Promise.all([listPublished("blog", { page, specialtySlug: specialty, tag }), listFacets("blog")]);
  return (
    <>
      {facets.specialties.length ? (
        <nav aria-label="Filter by specialty" className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link href="/blog" className={`pill px-3 py-1 ${!specialty ? "bg-brand text-white" : "bg-surface-2"}`}>All</Link>
          {facets.specialties.map((s) => (
            <Link key={s.slug} href={`/blog?specialty=${encodeURIComponent(s.slug)}`} className={`pill px-3 py-1 ${specialty === s.slug ? "bg-brand text-white" : "bg-surface-2"}`}>
              {s.label} <span className="ml-1 opacity-70">{s.n}</span>
            </Link>
          ))}
        </nav>
      ) : null}
      {items.length === 0 ? (
        total === 0 && !specialty && !tag ? <EmptyContent what="guides" /> : <p className="mt-6 text-muted">No guides match this filter yet.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => <ArticleCard key={a.id} a={a} />)}
        </ul>
      )}
      <Pagination page={page} pages={pages} basePath="/blog" query={{ specialty, tag }} />
      <p className="mt-8 text-xs text-muted">
        <Link href="/blog/feed.xml" className="underline">RSS feed</Link>
      </p>
    </>
  );
}
