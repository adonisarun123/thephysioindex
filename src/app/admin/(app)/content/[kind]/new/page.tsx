import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { ContentEditor } from "@/components/admin/content-editor";
import { requireStaff } from "@/lib/auth/session";
import { CONTENT_EDITOR_ROLE, KIND_LABEL_ADMIN, listSpecialtyOptions } from "@/lib/content/admin";
import { KIND } from "@/lib/content/schemas";

export default function Page({ params }: PageProps<"/admin/content/[kind]/new">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading editor…</p>}>
      <NewArticle params={params} />
    </Suspense>
  );
}

async function NewArticle({ params }: { params: PageProps<"/admin/content/[kind]/new">["params"] }) {
  const { kind: rawKind } = await params;
  const kindParsed = KIND.safeParse(rawKind);
  if (!kindParsed.success) notFound();
  const kind = kindParsed.data;
  await connection();
  await requireStaff(CONTENT_EDITOR_ROLE, `/admin/content/${kind}/new`);
  const specialties = await listSpecialtyOptions();
  const labels = KIND_LABEL_ADMIN[kind];
  return (
    <>
      <PageHeader title={`New ${labels.singular.toLowerCase()}`} description="Create a draft first; publishing requires the review fields." actions={<Link href={`/admin/content/${kind}`} className="btn btn-quiet py-2">Back to {labels.plural.toLowerCase()}</Link>} />
      <ContentEditor kind={kind} article={null} specialties={specialties} previewHref="#" />
    </>
  );
}
