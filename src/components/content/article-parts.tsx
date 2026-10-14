import Link from "next/link";
import type { FaqItem, SourceRef } from "@/db/schema/content";
import { renderInlineMarkdown, type TocEntry } from "@/lib/content/markdown";
import type { ArticleSummary, PublicArticle } from "@/lib/content/public";

/** Shared building blocks for editorial pages (SEO-01, SEO-04). */

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** Sanitised HTML body with typographic defaults. */
export function ArticleBody({ html }: { html: string }) {
  return (
    <div
      className="prose-tpi max-w-none text-[1.0625rem] leading-relaxed [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-line-strong [&_blockquote]:pl-4 [&_blockquote]:text-ink-2 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_h2]:mt-10 [&_h2]:scroll-mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-7 [&_h3]:scroll-mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:mt-5 [&_h4]:font-semibold [&_hr]:my-8 [&_hr]:border-line [&_img]:rounded-[var(--r)] [&_li]:mt-1 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-4 [&_table]:mt-4 [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:border-line [&_td]:py-2 [&_th]:py-2 [&_th]:text-left [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function Toc({ entries }: { entries: TocEntry[] }) {
  if (entries.length < 2) return null;
  return (
    <nav aria-label="On this page" className="card p-4 text-sm">
      <p className="font-semibold">On this page</p>
      <ol className="mt-2 grid gap-1 text-muted">
        {entries.map((e) => (
          <li key={e.id} className={e.depth === 3 ? "pl-4" : ""}>
            <a href={`#${e.id}`} className="hover:underline">{e.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Byline plus clinical review state. The review note is explicit either way (SEO-04). */
export function Byline({ a }: { a: PublicArticle }) {
  return (
    <div className="mt-4 grid gap-2 text-sm text-muted">
      <p>
        {a.authorPractitioner ? (
          <>
            By <Link href={a.authorPractitioner.path} className="font-medium text-foreground hover:underline">{a.authorPractitioner.displayName}</Link>, physiotherapist
          </>
        ) : a.authorName ? (
          <>By <span className="font-medium text-foreground">{a.authorName}</span></>
        ) : (
          <>By The Physio Index editorial team</>
        )}
        {" · "}
        <time dateTime={a.publishedAt}>Published {formatDate(a.publishedAt)}</time>
        {a.updatedAt && a.updatedAt.slice(0, 10) !== a.publishedAt.slice(0, 10) ? (
          <>
            {" · "}
            <time dateTime={a.updatedAt}>Updated {formatDate(a.updatedAt)}</time>
          </>
        ) : null}
        {a.readingMinutes ? ` · ${a.readingMinutes} min read` : ""}
      </p>
      <ReviewNote a={a} />
    </div>
  );
}

export function ReviewNote({ a }: { a: PublicArticle }) {
  if (a.reviewerName && a.reviewerCredential && a.reviewedAt) {
    return (
      <p className="inline-flex w-fit items-center gap-2 rounded-[var(--r-sm)] bg-brand-soft px-3 py-1.5 text-brand-ink">
        <span aria-hidden>✓</span>
        <span>
          Clinically reviewed by <strong>{a.reviewerName}</strong>, {a.reviewerCredential} on <time dateTime={a.reviewedAt}>{formatDate(a.reviewedAt)}</time>
        </span>
      </p>
    );
  }
  return (
    <p className="inline-flex w-fit items-center gap-2 rounded-[var(--r-sm)] bg-mark-soft px-3 py-1.5 text-ink-2">
      <span aria-hidden>!</span>
      <span>Not yet clinically reviewed. General information only; it does not replace an assessment by a qualified physiotherapist or doctor.</span>
    </p>
  );
}

export function FaqList({ faqs }: { faqs: FaqItem[] }) {
  if (!faqs.length) return null;
  return (
    <section id="faqs" className="mt-10 scroll-mt-6">
      <h2 className="text-2xl font-semibold">Frequently asked questions</h2>
      <dl className="mt-4 divide-y divide-line border-y border-line">
        {faqs.map((f, i) => (
          <div key={i} className="py-4">
            <dt className="font-semibold">{f.question}</dt>
            <dd className="mt-1 text-ink-2 [&_p]:mt-2 [&_p:first-child]:mt-0 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(f.answer) }} />
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SourcesList({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return null;
  return (
    <section id="sources" className="mt-10 scroll-mt-6">
      <h2 className="text-xl font-semibold">Sources</h2>
      <ol className="mt-3 grid gap-2 text-sm">
        {sources.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-muted">{i + 1}.</span>
            <span>
              <a href={s.url} rel="nofollow noopener noreferrer" target="_blank" className="underline">{s.title}</a>
              {s.publisher ? <span className="text-muted">, {s.publisher}</span> : null}
              {s.accessedOn ? <span className="text-muted"> (accessed {formatDate(s.accessedOn)})</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ArticleCard({ a, showKind }: { a: ArticleSummary; showKind?: boolean }) {
  return (
    <li className="card flex flex-col p-5">
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {showKind ? <span className="pill bg-surface-2">{a.kind === "blog" ? "Guide" : a.kind === "condition" ? "Condition" : "News"}</span> : null}
        {a.newsCategory ? <span className="pill bg-surface-2">{a.newsCategory}</span> : null}
        {a.specialty ? <span className="pill bg-brand-soft text-brand-ink">{a.specialty.label}</span> : null}
        <time dateTime={a.publishedAt}>{formatDate(a.publishedAt)}</time>
        {a.readingMinutes ? <span>· {a.readingMinutes} min</span> : null}
      </p>
      <h3 className="mt-2 text-lg font-semibold leading-snug">
        <Link href={a.path} className="hover:underline">{a.title}</Link>
      </h3>
      {a.dek ? <p className="mt-2 line-clamp-3 text-sm text-ink-2">{a.dek}</p> : null}
      <p className="mt-auto pt-3 text-xs text-muted">{a.reviewed ? "Clinically reviewed" : "Not yet clinically reviewed"}</p>
    </li>
  );
}

export function RelatedList({ title, items }: { title: string; items: ArticleSummary[] }) {
  if (!items.length) return null;
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {items.map((a) => <ArticleCard key={a.id} a={a} />)}
      </ul>
    </section>
  );
}

/** Simple numbered pagination that preserves other query parameters. */
export function Pagination({ page, pages, basePath, query }: { page: number; pages: number; basePath: string; query: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className="btn btn-quiet py-2">Previous</Link> : <span />}
      <span className="text-muted">Page {page} of {pages}</span>
      {page < pages ? <Link href={href(page + 1)} rel="next" className="btn btn-quiet py-2">Next</Link> : <span />}
    </nav>
  );
}

export function EmptyContent({ what }: { what: string }) {
  return (
    <div className="mt-6 card border-dashed p-6">
      <p className="font-medium">No {what} published yet.</p>
      <p className="mt-1 text-sm text-muted">Everything we publish is written for Indian patients and, where it makes clinical claims, reviewed by a qualified physiotherapist first. Check back soon.</p>
    </div>
  );
}
