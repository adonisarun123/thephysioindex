import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Notice, PageHeader, Section } from "@/components/workspace/forms/ui";
import { canEdit, listOwnArticles, type OwnArticle } from "@/lib/workspace/articles";
import { formatIst } from "@/lib/workspace/calendar";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { discardArticleAction, withdrawArticleAction } from "./actions";

export const metadata: Metadata = { title: "Articles" };

export default function Page({ searchParams }: PageProps<"/workspace/articles">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Articles searchParams={searchParams} />
    </Suspense>
  );
}

const LABEL: Record<OwnArticle["status"], string> = { draft: "Draft", in_review: "With our team for review", published: "Published", withdrawn: "Taken down", rejected: "Changes needed" };
const TONE: Record<OwnArticle["status"], string> = { draft: "bg-surface-2 text-ink-2", in_review: "bg-mark-soft text-ink-2", published: "bg-brand-soft text-brand-ink", withdrawn: "bg-surface-2 text-ink-2", rejected: "bg-alert-soft text-ink-2" };

/** The physiotherapist's own articles and where each one stands (SEO-04: nothing is public before moderation). */
async function Articles({ searchParams }: { searchParams: PageProps<"/workspace/articles">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace/articles");
  const articles = await listOwnArticles(p.id);
  const msg = readMessage(sp);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Articles"
        lede="Write about what you treat. Each approved article is published under your name, links to your profile and can be found on Google. Our team reads every article before it goes live."
        action={<Link href="/workspace/articles/new" className="btn btn-primary py-2 text-sm">Write an article</Link>}
      />
      <Notice ok={msg.ok} error={msg.error} />
      {p.listingStatus !== "published" ? (
        <p className="card mt-4 border-dashed p-4 text-sm text-muted">You can write and save drafts now. Sending an article for review opens once your profile is approved and published.</p>
      ) : null}
      <Section title={articles.length ? `Your articles (${articles.length})` : "No articles yet"}>
        {articles.length === 0 ? (
          <Empty>Pick one question your patients ask you every week and answer it in about 600 words. That is a good first article.</Empty>
        ) : (
          <ul className="divide-y divide-line border-y border-line text-sm">
            {articles.map((a) => (
              <li key={a.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{a.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className={`pill ${TONE[a.status]}`}>{LABEL[a.status]}</span>
                      <span>
                        {a.status === "published" && a.publishedAt ? `Published ${formatIst(a.publishedAt, { day: "numeric", month: "short", year: "numeric" })}` : `Last saved ${formatIst(a.updatedAt, { day: "numeric", month: "short", year: "numeric" })}`}
                      </span>
                    </p>
                    {a.status === "rejected" && a.decisionReason ? <p className="mt-2 border-l-2 border-line pl-3">Reviewer&apos;s note: {a.decisionReason}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.status === "published" ? <Link href={a.path} className="btn btn-quiet py-1.5 text-sm">View</Link> : null}
                    {canEdit(a.status) ? <Link href={`/workspace/articles/${a.id}`} className="btn btn-secondary py-1.5 text-sm">Edit</Link> : null}
                    {a.status === "published" || a.status === "in_review" ? (
                      <form action={withdrawArticleAction}>
                        <input type="hidden" name="articleId" value={a.id} />
                        <button type="submit" className="btn btn-quiet py-1.5 text-sm">{a.status === "published" ? "Take down" : "Take back to edit"}</button>
                      </form>
                    ) : null}
                    {(a.status === "draft" || a.status === "rejected") && !a.publishedAt ? (
                      <form action={discardArticleAction}>
                        <input type="hidden" name="articleId" value={a.id} />
                        <button type="submit" className="btn btn-quiet py-1.5 text-sm">Discard</button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
