import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ArticleCard, EmptyContent, Pagination } from "@/components/content/article-parts";
import { HUB_INDEX_THRESHOLD, countPublished, listFacets, listPublished } from "@/lib/content/public";
import { indexDecision, robotsFor } from "@/lib/seo/gate";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

/** News hub (SEO-01, SEO-02): noindex until it carries enough published items. */
export async function generateMetadata({ searchParams }: PageProps<"/news">): Promise<Metadata> {
  const sp = await searchParams;
  const filtered = Boolean(sp.category || (sp.page && sp.page !== "1"));
  const n = await countPublished("news").catch(() => 0);
  const d = await indexDecision("/news", { hasContent: n >= HUB_INDEX_THRESHOLD && !filtered });
  return {
    title: "Physiotherapy news in India",
    description: "Sector news, regulation, council updates and platform announcements relevant to physiotherapists and patients in India.",
    alternates: { canonical: "/news" },
    robots: robotsFor(d),
  };
}

export default function Page({ searchParams }: PageProps<"/news">) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Breadcrumbs siteUrl={siteUrl} items={[{ label: "Home", href: "/" }, { label: "News" }]} />
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">News</h1>
      <p className="mt-2 max-w-2xl text-muted">Regulation, council updates and what is changing on The Physio Index. Every item lists its sources; corrections are shown on the item.</p>
      <Suspense fallback={<p className="mt-8 text-muted">Loading news…</p>}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/news">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const category = typeof sp.category === "string" ? sp.category : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ items, pages, total }, facets] = await Promise.all([listPublished("news", { page, category }), listFacets("news")]);
  return (
    <>
      {facets.categories.length ? (
        <nav aria-label="Filter by category" className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link href="/news" className={`pill px-3 py-1 ${!category ? "bg-brand text-white" : "bg-surface-2"}`}>All</Link>
          {facets.categories.map((c) => (
            <Link key={c} href={`/news?category=${encodeURIComponent(c)}`} className={`pill px-3 py-1 ${category === c ? "bg-brand text-white" : "bg-surface-2"}`}>{c}</Link>
          ))}
        </nav>
      ) : null}
      {items.length === 0 ? (
        total === 0 && !category ? <EmptyContent what="news items" /> : <p className="mt-6 text-muted">No news in this category yet.</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a) => <ArticleCard key={a.id} a={a} />)}
        </ul>
      )}
      <Pagination page={page} pages={pages} basePath="/news" query={{ category }} />
      <p className="mt-8 text-xs text-muted">
        <Link href="/news/feed.xml" className="underline">RSS feed</Link>
      </p>
    </>
  );
}
