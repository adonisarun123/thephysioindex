import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Field, Input, Notice, Pill, Select, Sensitive, Table, Td, Textarea } from "@/components/admin/ui";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { fmtDateTime, type SP } from "@/lib/admin/format";
import { requireStaff } from "@/lib/auth/session";

export default function Page({ searchParams }: PageProps<"/admin/patients/export">) {
  return (
    <>
      <PageHeader title="Patient export" description="Scoped, purpose-bound CSV with the minimum operational fields. Up to 5,000 rows, generated on demand, never stored; the job record expires after 24 hours (PRO-17)." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/admin/patients/export">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff("support_agent");
  const jobs = await db().execute<{ id: string; kind: string; purpose: string; state: string; rowCount: number | null; requester: string | null; createdAt: Date; expiresAt: Date }>(sql`
    SELECT e.id, e.kind, e.purpose, e.state, e.row_count AS "rowCount", coalesce(u.display_name, u.email) AS requester, e.created_at AS "createdAt", e.expires_at AS "expiresAt"
    FROM export_jobs e LEFT JOIN users u ON u.id = e.requested_by_user_id ORDER BY e.created_at DESC LIMIT 25`);
  return (
    <>
      <Notice sp={sp} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="font-semibold">New export</h2>
          <Sensitive viewer={v} next="/admin/patients/export">
            <form method="post" action="/admin/patients/export/download" className="mt-3 grid gap-3">
              <Field label="Purpose (recorded on the export job and audit trail)" name="purpose"><Textarea name="purpose" required minLength={10} rows={2} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Status" name="status"><Select name="status" options={[{ value: "", label: "Any" }, { value: "active", label: "Active" }, { value: "merged", label: "Merged" }, { value: "closed", label: "Closed" }]} /></Field>
                <Field label="Name contains" name="q"><Input name="q" /></Field>
                <Field label="Created from" name="createdFrom"><Input name="createdFrom" type="date" /></Field>
                <Field label="Created to" name="createdTo"><Input name="createdTo" type="date" /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="includeMobile" /> Include mobile numbers (otherwise masked)</label>
              <button className="btn btn-primary" type="submit">Generate CSV</button>
            </form>
          </Sensitive>
        </section>
        <section className="card p-4">
          <h2 className="font-semibold">Recent export jobs</h2>
          <div className="mt-3">
            <Table head={["When", "Kind", "Rows", "Purpose", "Requested by", "State", "Expires"]}>
              {jobs.rows.length === 0 ? <Empty>No exports yet.</Empty> : null}
              {jobs.rows.map((j) => (
                <tr key={j.id}><Td className="text-xs">{fmtDateTime(j.createdAt)}</Td><Td>{j.kind}</Td><Td>{j.rowCount ?? "—"}</Td><Td className="text-xs">{j.purpose}</Td><Td className="text-xs">{j.requester}</Td><Td><Pill status={j.state === "ready" ? (new Date(j.expiresAt) < new Date() ? "expired" : "ready") : j.state} /></Td><Td className="text-xs">{fmtDateTime(j.expiresAt)}</Td></tr>
              ))}
            </Table>
          </div>
        </section>
      </div>
    </>
  );
}
