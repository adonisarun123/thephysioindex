import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, JsonView, Notice, Pill, Table, Tabs, Td } from "@/components/admin/ui";
import { first, fmtDateTime, type SP } from "@/lib/admin/format";
import { listPolicies } from "@/lib/admin/master";
import { hasRole, requireStaff } from "@/lib/auth/session";

export default function Page({ searchParams }: PageProps<"/admin/policies">) {
  return (
    <>
      <PageHeader title="Policies and templates" description="Versioned rules: cancellation, terms, privacy notice, jurisdiction, ranking and offer terms. A published version is never edited; a new version supersedes it (ADM-05)." actions={<><Link href="/admin/policies/templates" className="btn btn-quiet py-1.5">Notification templates</Link><Link href="/admin/policies/new" className="btn btn-primary py-1.5">New version</Link></>} />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const TYPES = ["cancellation", "provider_terms", "patient_terms", "privacy_notice", "jurisdiction", "ranking", "offer_terms"];

async function Body({ searchParams }: { searchParams: PageProps<"/admin/policies">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff();
  const type = TYPES.includes(first(sp.type) ?? "") ? first(sp.type) : undefined;
  const highlight = first(sp.highlight);
  const policies = await listPolicies(type);
  const groups = new Map<string, typeof policies>();
  for (const p of policies) {
    const k = `${p.type}/${p.key}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return (
    <>
      <Notice sp={sp} />
      {!hasRole(v, "super_admin") ? <p className="mb-3 text-xs text-muted">Read-only for your role.</p> : null}
      <Tabs current={type ?? "all"} items={[{ href: "/admin/policies", label: "all" }, ...TYPES.map((t) => ({ href: `/admin/policies?type=${t}`, label: t.replace("_", " ") }))]} />
      {groups.size === 0 ? <p className="text-sm text-muted">No policies.</p> : null}
      {[...groups.entries()].map(([k, versions]) => (
        <section key={k} className="card mt-4 p-4">
          <h2 className="font-semibold">{versions[0].title} <span className="text-xs text-muted">· {k}{versions[0].stateName ? ` · ${versions[0].stateName}` : ""}</span></h2>
          <div className="mt-2">
            <Table head={["Version", "Status", "Effective", "Superseded", "Approved by", "Content"]}>
              {versions.length === 0 ? <Empty /> : null}
              {versions.map((p) => {
                const now = Date.now();
                const status = p.supersededAt ? "superseded" : new Date(p.effectiveAt).getTime() > now ? "scheduled" : "active";
                return (
                  <tr key={p.id} className={highlight === p.id ? "bg-brand-soft/40" : ""}>
                    <Td><code className="text-xs">{p.version}</code></Td>
                    <Td><Pill status={status === "scheduled" ? "pending" : status} label={status} /></Td>
                    <Td className="text-xs">{fmtDateTime(p.effectiveAt)}</Td>
                    <Td className="text-xs">{fmtDateTime(p.supersededAt)}</Td>
                    <Td className="text-xs">{p.approvedBy ?? "seed"}</Td>
                    <Td><details><summary className="cursor-pointer text-xs underline">show</summary><JsonView value={p.content} />{p.bodyMarkdown ? <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--r-sm)] bg-surface-2 p-2 text-xs">{p.bodyMarkdown}</pre> : null}</details></Td>
                  </tr>
                );
              })}
            </Table>
          </div>
        </section>
      ))}
    </>
  );
}
