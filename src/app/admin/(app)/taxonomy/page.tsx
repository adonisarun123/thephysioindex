import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Field, Hidden, Input, Notice, Pill, Section, Select, Table, Tabs, Td } from "@/components/admin/ui";
import { first, type SP } from "@/lib/admin/format";
import { listTaxonomy } from "@/lib/admin/master";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { upsertTaxonomyAction } from "../actions/master";

export default function Page({ searchParams }: PageProps<"/admin/taxonomy">) {
  return (
    <>
      <PageHeader title="Specialties, services and languages" description="Controlled taxonomies (PRO-08). Codes are immutable; labels, descriptions, order and active flag are editable by a super administrator." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const KINDS = ["specialties", "services", "languages"] as const;
const SERVICE_KINDS = ["initial_assessment", "follow_up", "procedure", "package", "other"];

async function Body({ searchParams }: { searchParams: PageProps<"/admin/taxonomy">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff();
  const tab = (KINDS.includes(first(sp.tab) as (typeof KINDS)[number]) ? first(sp.tab) : "specialties") as (typeof KINDS)[number];
  const rows = await listTaxonomy(tab);
  const isSuper = hasRole(v, "super_admin");
  const extraLabel = tab === "specialties" ? "Requires evidence" : tab === "services" ? "Kind" : null;
  const descLabel = tab === "languages" ? "Native label" : "Description";
  return (
    <>
      <Notice sp={sp} />
      <Tabs current={tab} items={KINDS.map((k) => ({ href: `/admin/taxonomy?tab=${k}`, label: k }))} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Table head={["Code", "Label", descLabel, extraLabel ?? "", "Order", "Active", "In use", isSuper ? "Edit" : ""]}>
          {rows.length === 0 ? <Empty>Nothing here.</Empty> : null}
          {rows.map((r) => (
            <tr key={r.id}>
              <Td><code className="text-xs">{r.code}</code>{r.slug ? <div className="text-xs text-muted">/{r.slug}</div> : null}</Td>
              <Td className="font-semibold">{r.label}</Td>
              <Td className="max-w-xs text-xs">{r.description ?? "—"}</Td>
              <Td className="text-xs">{r.extra?.replace(/_/g, " ") ?? ""}</Td>
              <Td>{r.sortOrder}</Td>
              <Td><Pill status={r.active ? "active" : "inactive"} /></Td>
              <Td>{r.usage}</Td>
              <Td>
                {isSuper ? (
                  <details>
                    <summary className="cursor-pointer text-sm underline">Edit</summary>
                    <form action={upsertTaxonomyAction} className="mt-2 grid w-64 gap-1 text-sm">
                      <Hidden name="kind" value={tab} /><Hidden name="id" value={r.id} />
                      <Input name="label" defaultValue={r.label} required aria-label="Label" className="py-1" />
                      <Input name="description" defaultValue={r.description ?? ""} placeholder={descLabel} aria-label={descLabel} className="py-1" />
                      {tab === "specialties" ? <Select name="extra" defaultValue={r.extra ? "requires_evidence" : ""} aria-label="Evidence" className="py-1" options={[{ value: "", label: "No evidence needed" }, { value: "requires_evidence", label: "Requires evidence" }]} /> : null}
                      {tab === "services" ? <Select name="extra" defaultValue={r.extra ?? "other"} aria-label="Kind" className="py-1" options={SERVICE_KINDS.map((k) => ({ value: k, label: k.replace("_", " ") }))} /> : null}
                      <Input name="sortOrder" type="number" defaultValue={r.sortOrder} aria-label="Sort order" className="py-1" />
                      <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={r.active} /> Active</label>
                      <Input name="reason" required placeholder="Reason" aria-label="Reason" className="py-1" />
                      <button className="btn btn-secondary py-1" type="submit">Save</button>
                    </form>
                  </details>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
        {isSuper ? (
          <Section title={`Add to ${tab}`}>
            <form action={upsertTaxonomyAction} className="grid gap-2">
              <Hidden name="kind" value={tab} />
              <Field label="Code (immutable)" name="code"><Input name="code" required pattern="[a-z0-9_\-]{2,60}" /></Field>
              <Field label="Label" name="label"><Input name="label" required /></Field>
              <Field label={descLabel} name="description"><Input name="description" /></Field>
              {tab === "specialties" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="extra" value="requires_evidence" /> Requires supporting evidence</label> : null}
              {tab === "services" ? <Field label="Kind" name="extra"><Select name="extra" options={SERVICE_KINDS.map((k) => ({ value: k, label: k.replace("_", " ") }))} /></Field> : null}
              <Field label="Sort order" name="sortOrder"><Input name="sortOrder" type="number" defaultValue={100} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked /> Active</label>
              <Field label="Reason" name="reason"><Input name="reason" required /></Field>
              <button className="btn btn-primary py-1.5" type="submit">Add</button>
            </form>
          </Section>
        ) : null}
      </div>
    </>
  );
}
