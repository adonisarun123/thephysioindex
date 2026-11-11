import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArticleEditor } from "@/components/workspace/article-editor";
import { BackLink, Notice, PageHeader } from "@/components/workspace/forms/ui";
import { canEdit, getOwnArticle } from "@/lib/workspace/articles";
import { listSpecialtyOptions } from "@/lib/workspace/catalog";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage, withQuery } from "@/lib/workspace/forms";
import { saveArticleAction } from "../actions";

export const metadata: Metadata = { title: "Edit article" };

export default function Page({ params, searchParams }: PageProps<"/workspace/articles/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <EditArticle params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditArticle({ params, searchParams }: { params: PageProps<"/workspace/articles/[id]">["params"]; searchParams: PageProps<"/workspace/articles/[id]">["searchParams"] }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { practitioner: p } = await requireWorkspace(`/workspace/articles/${id}`);
  // Scoped to the signed-in practitioner: another author's article is simply not found (IAM-01).
  const article = await getOwnArticle(p.id, id);
  if (!article) notFound();
  if (!canEdit(article.status)) redirect(withQuery("/workspace/articles", { error: article.status === "in_review" ? "That article is with our team for review. Take it back to edit it." : "Take the article down before editing it." }));
  const specialties = await listSpecialtyOptions();
  const msg = readMessage(sp);
  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/workspace/articles">Back to articles</BackLink>
      <div className="mt-3">
        <PageHeader title="Edit article" lede={article.status === "rejected" && article.decisionReason ? `Reviewer's note: ${article.decisionReason}` : undefined} />
      </div>
      <Notice ok={msg.ok} error={msg.error} />
      <form action={saveArticleAction}>
        <input type="hidden" name="articleId" value={article.id} />
        <ArticleEditor
          initial={{ title: article.title, summary: article.summary, body: article.body, audience: article.audience, primarySpecialtyId: article.primarySpecialtyId, faqs: article.faqs, sources: article.sources.map((s) => ({ title: s.title, url: s.url })) }}
          specialties={specialties.map((s) => ({ id: s.id, label: s.label }))}
          canSubmit={p.listingStatus === "published"}
          cannotSubmitReason="You can send articles for review once your profile is approved and published. Save this as a draft for now."
        />
      </form>
    </div>
  );
}
