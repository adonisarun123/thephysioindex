import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ArticleBody, Byline, RelatedList, SourcesList, formatDate } from "@/components/content/article-parts";
import { newsArticleJsonLd } from "@/lib/content/jsonld";
import { renderMarkdown } from "@/lib/content/markdown";
import { getPublished, listRelated } from "@/lib/content/public";
import { indexDecision, robotsFor } from "@/lib/seo/gate";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

export async function generateMetadata({ params }: PageProps<"/news/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const a = await getPublished("news", slug);
  if (!a) return { title: "News item not found", robots: { index: false, follow: false } };
  const d = await indexDecision(a.path, { hasContent: !a.noindex });
  return {
    title: a.title,
    description: a.dek ?? renderMarkdown(a.bodyMarkdown).excerpt,
    alternates: { canonical: a.path, types: { "application/rss+xml": "/news/feed.xml" } },
    robots: robotsFor(d),
    openGraph: { type: "article", title: a.title, description: a.dek ?? undefined, url: a.path, publishedTime: a.publishedAt, modifiedTime: a.updatedAt, section: a.newsCategory ?? undefined },
  };
}

export default function Page({ params }: PageProps<"/news/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 text-muted">Loading…</div>}>
      <Article params={params} />
    </Suspense>
  );
}

async function Article({ params }: { params: PageProps<"/news/[slug]">["params"] }) {
  const { slug } = await params;
  await connection();
  const a = await getPublished("news", slug);
  if (!a) notFound();
  const rendered = renderMarkdown(a.bodyMarkdown);
  const related = await listRelated("news", a.id, null, 3);
  const crumbs = [{ label: "Home", href: "/" }, { label: "News", href: "/news" }, { label: a.title }];

  return (
    <article className="mx-auto max-w-3xl px-4 py-6 lg:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(newsArticleJsonLd(a, siteUrl, rendered.excerpt)) }} />
      <Breadcrumbs siteUrl={siteUrl} items={crumbs} />
      <header className="mt-5">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          {a.newsCategory ? <Link href={`/news?category=${encodeURIComponent(a.newsCategory)}`} className="pill bg-surface-2">{a.newsCategory}</Link> : null}
          <time dateTime={a.publishedAt} className="uppercase tracking-wide">{formatDate(a.publishedAt)}</time>
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{a.title}</h1>
        {a.dek ? <p className="mt-3 text-lg text-ink-2">{a.dek}</p> : null}
        <Byline a={a} />
      </header>

      {a.correction ? (
        <aside className="mt-6 rounded-[var(--r)] border border-mark bg-mark-soft p-4 text-sm" aria-label="Correction">
          <p className="font-semibold">Correction{a.correctedAt ? ` — ${formatDate(a.correctedAt)}` : ""}</p>
          <p className="mt-1">{a.correction}</p>
        </aside>
      ) : null}

      <div className="mt-8">
        <ArticleBody html={rendered.html} />
        <SourcesList sources={a.sources} />
        <p className="mt-8 text-xs text-muted">
          Spotted an error? <Link href="/help#correction" className="underline">Request a correction</Link>. Corrections are noted on the item itself.
        </p>
      </div>
      <RelatedList title="More news" items={related} />
    </article>
  );
}
