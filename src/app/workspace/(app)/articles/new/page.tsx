import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArticleEditor } from "@/components/workspace/article-editor";
import { BackLink, Notice, PageHeader } from "@/components/workspace/forms/ui";
import { listSpecialtyOptions } from "@/lib/workspace/catalog";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { saveArticleAction } from "../actions";

export const metadata: Metadata = { title: "Write an article" };

export default function Page({ searchParams }: PageProps<"/workspace/articles/new">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <NewArticle searchParams={searchParams} />
    </Suspense>
  );
}

async function NewArticle({ searchParams }: { searchParams: PageProps<"/workspace/articles/new">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace/articles/new");
  const specialties = await listSpecialtyOptions();
  const msg = readMessage(sp);
  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/workspace/articles">Back to articles</BackLink>
      <div className="mt-3">
        <PageHeader title="Write an article" lede="Answer one question your patients ask. The checklist on the right shows what is needed before it can be sent for review." />
      </div>
      <Notice ok={msg.ok} error={msg.error} />
      <form action={saveArticleAction}>
        <ArticleEditor
          initial={{ title: "", summary: "", body: "", audience: "patients", primarySpecialtyId: null, faqs: [], sources: [] }}
          specialties={specialties.map((s) => ({ id: s.id, label: s.label }))}
          canSubmit={p.listingStatus === "published"}
          cannotSubmitReason="You can send articles for review once your profile is approved and published. Save this as a draft for now."
        />
      </form>
    </div>
  );
}
