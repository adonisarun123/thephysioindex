import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Field, Input, Notice, Pill, Table, Td, Textarea } from "@/components/admin/ui";
import { fmtDate, fmtDateTime, type SP } from "@/lib/admin/format";
import { IMPORT_COLUMNS, listBatches } from "@/lib/admin/imports";
import { requireStaff } from "@/lib/auth/session";
import { uploadBatchAction } from "../actions/imports";

export default function Page({ searchParams }: PageProps<"/admin/imports">) {
  return (
    <>
      <PageHeader title="Imports" description="Bulk onboarding into a private staging area. Rows become unclaimed drafts in listing review; import never verifies or claims a profile (ADM-06, PRO-07)." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/admin/imports">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff("verification_reviewer");
  const batches = await listBatches();
  return (
    <>
      <Notice sp={sp} />
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <section className="card p-4">
          <h2 className="font-semibold">Stage a CSV</h2>
          <p className="mt-1 text-xs text-muted">Columns: {IMPORT_COLUMNS.join(", ")}. Header names are matched loosely (e.g. “pincode”, “reg_no”). Max 2,000 rows.</p>
          <form action={uploadBatchAction} encType="multipart/form-data" className="mt-3 grid gap-3">
            <Field label="CSV file" name="file"><input id="file" name="file" type="file" accept=".csv,text/csv" required className="input" /></Field>
            <Field label="Source name" name="sourceName"><Input name="sourceName" required placeholder="e.g. State council register extract" /></Field>
            <Field label="Source URL" name="sourceUrl"><Input name="sourceUrl" type="url" /></Field>
            <Field label="Collected on" name="collectedOn"><Input name="collectedOn" type="date" required /></Field>
            <Field label="Permitted use basis" name="permittedUseBasis" hint="Why this data may be published as professional business data (PRO-07)."><Textarea name="permittedUseBasis" required minLength={5} rows={2} /></Field>
            <button className="btn btn-primary" type="submit">Stage and validate</button>
          </form>
        </section>
        <section>
          <Table head={["Batch", "Source", "Collected", "Rows", "Validation", "State", "By", "Created"]}>
            {batches.length === 0 ? <Empty>No import batches yet.</Empty> : null}
            {batches.map((b) => {
              const val = (b.summary?.validation ?? null) as { valid?: number; invalid?: number; duplicate?: number } | null;
              return (
                <tr key={b.id}>
                  <Td><Link href={`/admin/imports/${b.id}`} className="font-semibold underline">{b.id.slice(0, 8)}</Link></Td>
                  <Td>{b.sourceName}{b.sourceUrl ? <div className="truncate text-xs text-muted" style={{ maxWidth: "16rem" }}>{b.sourceUrl}</div> : null}</Td>
                  <Td className="text-xs">{fmtDate(b.collectedOn)}</Td>
                  <Td>{b.rowCount}</Td>
                  <Td className="text-xs">{val ? `${val.valid ?? 0} valid · ${val.duplicate ?? 0} dup · ${val.invalid ?? 0} invalid` : "—"}</Td>
                  <Td><Pill status={b.state} /></Td>
                  <Td className="text-xs">{b.createdBy}</Td>
                  <Td className="text-xs">{fmtDateTime(b.createdAt)}</Td>
                </tr>
              );
            })}
          </Table>
        </section>
      </div>
    </>
  );
}
