import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { DL, Empty, Field, Hidden, Notice, Pill, Section, Sensitive, Table, Td, Textarea } from "@/components/admin/ui";
import { fmtDate, fmtDateTime, type SP } from "@/lib/admin/format";
import { getBatch, normaliseRecord } from "@/lib/admin/imports";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { publishBatchAction, revalidateBatchAction, revertBatchAction } from "../../actions/imports";

export default function Page({ params, searchParams }: PageProps<"/admin/imports/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading batch…</p>}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Detail({ params, searchParams }: { params: PageProps<"/admin/imports/[id]">["params"]; searchParams: PageProps<"/admin/imports/[id]">["searchParams"] }) {
  const { id } = await params;
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff("verification_reviewer");
  const data = await getBatch(id);
  if (!data) notFound();
  const { batch: b, rows } = data;
  const counts = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.state] = (acc[r.state] ?? 0) + 1), acc), {});
  const created = (b.summary?.created ?? null) as { practitionerIds?: string[]; clinicIds?: string[]; branchIds?: string[]; caseIds?: string[] } | null;
  const canPublish = b.state === "validated" || b.state === "staged";

  return (
    <>
      <PageHeader title={`Import batch ${id.slice(0, 8)}`} description={`${b.sourceName} · collected ${fmtDate(b.collectedOn)} · ${b.rowCount} rows`} actions={<Link href="/admin/imports" className="btn btn-quiet py-1.5">All batches</Link>} />
      <Notice sp={sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div>
          <Section title={`Dry run — ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(", ") || "no rows"}`}>
            <Table head={["#", "Name", "Registration", "Clinic / branch", "Place", "State", "Errors / warnings", "Result"]}>
              {rows.length === 0 ? <Empty>No rows.</Empty> : null}
              {rows.map((r) => {
                const n = normaliseRecord(r.raw);
                return (
                  <tr key={r.id}>
                    <Td className="text-xs text-muted">{r.rowNo}</Td>
                    <Td>{n.name}<div className="text-xs text-muted">{n.designation}</div></Td>
                    <Td className="text-xs">{n.registration_authority}{n.registration_number ? <div>{n.registration_number}</div> : null}</Td>
                    <Td className="text-xs">{n.clinic}<div className="text-muted">{n.branch_address}</div></Td>
                    <Td className="text-xs">{[n.locality, n.city, n.state].filter(Boolean).join(", ")} {n.pin}</Td>
                    <Td><Pill status={r.state} /></Td>
                    <Td className="text-xs text-alert">{(r.errors ?? []).join("; ")}</Td>
                    <Td className="text-xs">{r.practitionerId ? <Link href={`/admin/practitioners/${r.practitionerId}`} className="underline">profile</Link> : "—"}</Td>
                  </tr>
                );
              })}
            </Table>
          </Section>
        </div>
        <aside>
          <Section title="Batch">
            <DL items={[["State", <Pill key="s" status={b.state} />], ["Source URL", b.sourceUrl ?? "—"], ["Permitted use", b.permittedUseBasis], ["Staged by", b.createdBy ?? "—"], ["Created", fmtDateTime(b.createdAt)], ["Created records", created ? `${created.practitionerIds?.length ?? 0} profiles, ${created.clinicIds?.length ?? 0} clinics, ${created.branchIds?.length ?? 0} branches, ${created.caseIds?.length ?? 0} cases` : "—"]]} />
          </Section>
          {canPublish ? (
            <Section title="Publish batch">
              <form action={revalidateBatchAction} className="mb-3"><Hidden name="batchId" value={id} /><button className="btn btn-quiet py-1.5" type="submit">Re-run validation</button></form>
              <form action={publishBatchAction} className="grid gap-2">
                <Hidden name="batchId" value={id} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="includeDuplicates" /> Also publish rows flagged as duplicates (each gets a duplicate warning on its review case)</label>
                <Field label="Reason" name="reason"><Textarea name="reason" required rows={2} /></Field>
                <ConfirmButton message={`Publish ${counts.valid ?? 0} valid row(s) as unclaimed drafts in listing review?`} className="btn btn-primary py-1.5">Publish {counts.valid ?? 0} valid row(s)</ConfirmButton>
                <p className="text-xs text-muted">Creates practitioners (source imported, unclaimed, not bookable), clinics and branches as drafts, self-declared credentials and one listing_review case per row (ADM-06).</p>
              </form>
            </Section>
          ) : null}
          {b.state === "published" && hasRole(v, "super_admin") ? (
            <Section title="Revert batch">
              <Sensitive viewer={v} next={`/admin/imports/${id}`}>
                <form action={revertBatchAction} className="grid gap-2">
                  <Hidden name="batchId" value={id} />
                  <Field label="Reason" name="reason"><Textarea name="reason" required rows={2} /></Field>
                  <ConfirmButton message="Archive every unclaimed profile, branch and clinic this batch created and close its review cases?" className="btn btn-quiet py-1.5 text-alert">Revert batch</ConfirmButton>
                </form>
              </Sensitive>
            </Section>
          ) : null}
        </aside>
      </div>
    </>
  );
}
