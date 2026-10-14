import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { requireStaff } from "@/lib/auth/session";
import { CONTENT_EDITOR_ROLE, KIND_LABEL_ADMIN, STATUSES, STATUS_LABEL, listArticles, type ContentStatus } from "@/lib/content/admin";
import { KIND } from "@/lib/content/schemas";

/** Content list per kind with status tabs and title search (SEO-04 workflow). */
export default function Page({ params, searchParams }: PageProps<"/admin/content/[kind]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <List params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function List({ params, searchParams }: { params: PageProps<"/admin/content/[kind]">["params"]; searchParams: PageProps<"/admin/content/[kind]">["searchParams"] }) {
  const [{ kind: rawKind }, sp] = await Promise.all([params, searchParams]);
  const kindParsed = KIND.safeParse(rawKind);
  if (!kindParsed.success) notFound();
  const kind = kindParsed.data;
  await connection();
  await requireStaff(CONTENT_EDITOR_ROLE, `/admin/content/${kind}`);
  const status = STATUSES.includes(sp.status as ContentStatus) ? (sp.status as ContentStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q : "";
  const { rows, counts } = await listArticles(kind, { status, q });
  const labels = KIND_LABEL_ADMIN[kind];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tabHref = (s?: ContentStatus) => `/admin/content/${kind}${s ? `?status=${s}` : ""}${q ? `${s ? "&" : "?"}q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageHeader
        title={labels.plural}
        description={kind === "condition" ? "Condition pages need a named clinical reviewer before publication (SEO-04)." : kind === "news" ? "News items carry sources and visible corrections." : "Guides state whether they have been clinically reviewed."}
        actions={<Link href={`/admin/content/${kind}/new`} className="btn btn-primary py-2">New {labels.singular.toLowerCase()}</Link>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Status" className="flex flex-wrap gap-1 text-sm">
          <Link href={tabHref()} className={`pill px-3 py-1 ${!status ? "bg-brand text-white" : "bg-surface-2"}`}>All {total}</Link>
          {STATUSES.map((s) => (
            <Link key={s} href={tabHref(s)} className={`pill px-3 py-1 ${status === s ? "bg-brand text-white" : "bg-surface-2"}`}>
              {STATUS_LABEL[s]} {counts[s]}
            </Link>
          ))}
        </nav>
        <form method="get" className="flex gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <input name="q" defaultValue={q} className="input py-1.5" placeholder="Search by title or slug" aria-label="Search" />
          <button className="btn btn-quiet py-1.5" type="submit">Search</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{q ? `Nothing matches “${q}”.` : status ? `No ${STATUS_LABEL[status].toLowerCase()} items.` : `No ${labels.plural.toLowerCase()} yet.`}</p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 font-normal">Title</th>
              <th className="py-2 font-normal">Status</th>
              <th className="hidden py-2 font-normal md:table-cell">Specialty</th>
              <th className="hidden py-2 font-normal md:table-cell">Review</th>
              <th className="py-2 text-right font-normal">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-2">
                  <Link href={`/admin/content/${kind}/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                  <span className="block font-mono text-xs text-muted">/{r.slug} · rev {r.revisionCount}</span>
                </td>
                <td className="py-2"><span className={`pill ${r.status === "published" ? "bg-brand-soft text-brand-ink" : r.status === "in_review" ? "bg-mark-soft" : r.status === "rejected" ? "bg-alert-soft text-alert" : "bg-surface-2"}`}>{STATUS_LABEL[r.status]}</span></td>
                <td className="hidden py-2 text-muted md:table-cell">{r.specialtyLabel ?? "—"}</td>
                <td className="hidden py-2 text-muted md:table-cell">{r.reviewed ? "Reviewed" : "Not reviewed"}</td>
                <td className="py-2 text-right text-muted">{new Date(r.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
