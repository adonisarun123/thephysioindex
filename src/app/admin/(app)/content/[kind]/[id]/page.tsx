import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { ContentEditor } from "@/components/admin/content-editor";
import { ArticleBody, FaqList, SourcesList, Toc } from "@/components/content/article-parts";
import { ConditionSections, RedFlagBox } from "@/components/content/condition-sections";
import { requireStaff } from "@/lib/auth/session";
import { CONTENT_EDITOR_ROLE, KIND_LABEL_ADMIN, getArticle, listSpecialtyOptions } from "@/lib/content/admin";
import { renderMarkdown } from "@/lib/content/markdown";
import { KIND } from "@/lib/content/schemas";

/** Edit page. `?preview=1` renders the saved body server-side with the same pipeline the public page uses. */
export default function Page({ params, searchParams }: PageProps<"/admin/content/[kind]/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading editor…</p>}>
      <Edit params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Edit({ params, searchParams }: { params: PageProps<"/admin/content/[kind]/[id]">["params"]; searchParams: PageProps<"/admin/content/[kind]/[id]">["searchParams"] }) {
  const [{ kind: rawKind, id }, sp] = await Promise.all([params, searchParams]);
  const kindParsed = KIND.safeParse(rawKind);
  if (!kindParsed.success) notFound();
  const kind = kindParsed.data;
  await connection();
  await requireStaff(CONTENT_EDITOR_ROLE, `/admin/content/${kind}/${id}`);
  const [article, specialties] = await Promise.all([getArticle(id), listSpecialtyOptions()]);
  if (!article || article.kind !== kind) notFound();
  const preview = sp.preview === "1";
  const notice = typeof sp.notice === "string" ? sp.notice : undefined;
  const labels = KIND_LABEL_ADMIN[kind];
  const base = `/admin/content/${kind}/${article.id}`;

  return (
    <>
      <PageHeader
        title={article.title}
        description={`${labels.singular} · /${article.slug}`}
        actions={
          <>
            <Link href={preview ? base : `${base}?preview=1`} className="btn btn-quiet py-2">{preview ? "Hide preview" : "Preview"}</Link>
            <Link href={`/admin/content/${kind}`} className="btn btn-quiet py-2">Back</Link>
          </>
        }
      />
      {preview ? <Preview kind={kind} article={article} /> : null}
      <ContentEditor kind={kind} article={article} specialties={specialties} previewHref={`${base}?preview=1`} notice={notice} />
    </>
  );
}

function Preview({ kind, article }: { kind: "blog" | "condition" | "news"; article: NonNullable<Awaited<ReturnType<typeof getArticle>>> }) {
  const rendered = renderMarkdown(article.bodyMarkdown);
  return (
    <section className="card mb-8 p-6" aria-label="Preview of the saved body">
      <p className="mb-4 text-xs text-muted">Preview of the last saved version ({rendered.wordCount} words, {rendered.readingMinutes} min read). Unsaved edits are not shown.</p>
      <div className="grid gap-8 lg:grid-cols-[1fr_16rem]">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight">{article.title}</h1>
          {article.dek ? <p className="mt-2 text-lg text-ink-2">{article.dek}</p> : null}
          {kind === "condition" ? (
            <div className="mt-6">
              <RedFlagBox flags={article.condition?.redFlags ?? []} />
              <ConditionSections meta={article.condition} />
            </div>
          ) : null}
          <div className="mt-6">
            <ArticleBody html={rendered.html} />
          </div>
          <FaqList faqs={article.faqs} />
          <SourcesList sources={article.sources} />
        </div>
        <Toc entries={rendered.toc} />
      </div>
    </section>
  );
}
