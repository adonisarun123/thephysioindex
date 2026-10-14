import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ArticleBody, Byline, FaqList, RelatedList, SourcesList, Toc } from "@/components/content/article-parts";
import { blogPostingJsonLd, faqPageJsonLd } from "@/lib/content/jsonld";
import { renderMarkdown } from "@/lib/content/markdown";
import { getPublished, listRelated } from "@/lib/content/public";
import { indexDecision, robotsFor } from "@/lib/seo/gate";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

/** Only published articles resolve; drafts and withdrawn items 404 (SEO-02, DAT-02). */
export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const a = await getPublished("blog", slug);
  if (!a) return { title: "Guide not found", robots: { index: false, follow: false } };
  const d = await indexDecision(a.path, { hasContent: !a.noindex });
  return {
    title: a.title,
    description: a.dek ?? renderMarkdown(a.bodyMarkdown).excerpt,
    alternates: { canonical: a.path, types: { "application/rss+xml": "/blog/feed.xml" } },
    robots: robotsFor(d),
    openGraph: { type: "article", title: a.title, description: a.dek ?? undefined, url: a.path, publishedTime: a.publishedAt, modifiedTime: a.updatedAt, tags: a.tags },
  };
}

export default function Page({ params }: PageProps<"/blog/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 text-muted">Loading guide…</div>}>
      <Article params={params} />
    </Suspense>
  );
}

async function Article({ params }: { params: PageProps<"/blog/[slug]">["params"] }) {
  const { slug } = await params;
  await connection();
  const a = await getPublished("blog", slug);
  if (!a) notFound();
  const rendered = renderMarkdown(a.bodyMarkdown);
  const related = await listRelated("blog", a.id, a.specialty?.slug ?? null);
  const crumbs = [{ label: "Home", href: "/" }, { label: "Guides", href: "/blog" }, { label: a.title }];
  const ld = [blogPostingJsonLd(a, siteUrl, rendered.excerpt, rendered.wordCount), faqPageJsonLd(a, siteUrl)].filter(Boolean);

  return (
    <article className="mx-auto max-w-6xl px-4 py-6 lg:py-10">
      {ld.map((o, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />)}
      <Breadcrumbs siteUrl={siteUrl} items={crumbs} />
      <header className="mt-5 max-w-3xl">
        {a.specialty ? <Link href={`/blog?specialty=${encodeURIComponent(a.specialty.slug)}`} className="pill bg-brand-soft text-brand-ink">{a.specialty.label}</Link> : null}
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{a.title}</h1>
        {a.dek ? <p className="mt-3 text-lg text-ink-2">{a.dek}</p> : null}
        <Byline a={a} />
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_17rem]">
        <div className="min-w-0 max-w-3xl">
          <ArticleBody html={rendered.html} />
          <FaqList faqs={a.faqs} />
          <SourcesList sources={a.sources} />
          {a.tags.length ? (
            <p className="mt-8 flex flex-wrap gap-2 text-xs">
              {a.tags.map((t) => <Link key={t} href={`/blog?tag=${encodeURIComponent(t)}`} className="pill bg-surface-2 hover:bg-brand-soft">{t}</Link>)}
            </p>
          ) : null}
          <p className="mt-8 text-xs text-muted">
            This guide is general information for patients in India and does not replace an individual assessment. If your symptoms are severe or getting worse, see a physiotherapist or doctor.
          </p>
        </div>
        <aside className="order-first lg:order-none lg:sticky lg:top-4 lg:self-start">
          <Toc entries={rendered.toc} />
          {a.specialty ? (
            <div className="card mt-4 p-4 text-sm">
              <p className="font-semibold">Need hands-on help?</p>
              <p className="mt-1 text-muted">Find a {a.specialty.label.toLowerCase()} practitioner near you.</p>
              <Link href={`/physiotherapists?specialty=${encodeURIComponent(a.specialty.slug)}`} className="btn btn-secondary mt-3 w-full py-2">Find a physiotherapist</Link>
            </div>
          ) : null}
        </aside>
      </div>
      <RelatedList title="Related guides" items={related} />
    </article>
  );
}
