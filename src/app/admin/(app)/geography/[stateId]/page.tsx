import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Empty, Field, Hidden, Input, Notice, Pill, Section, Select, Sensitive, Table, Td } from "@/components/admin/ui";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { SP } from "@/lib/admin/format";
import { listCitiesAdmin } from "@/lib/admin/master";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { aliasAction, mergeCityAction, upsertCityAction } from "../../actions/geography";

export default function Page({ params, searchParams }: PageProps<"/admin/geography/[stateId]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Cities params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Cities({ params, searchParams }: { params: PageProps<"/admin/geography/[stateId]">["params"]; searchParams: PageProps<"/admin/geography/[stateId]">["searchParams"] }) {
  const { stateId } = await params;
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff();
  const st = await db().execute<{ id: string; name: string; code: string }>(sql`SELECT id, name, code FROM states WHERE id = ${stateId}`);
  if (!st.rows[0]) notFound();
  const cities = await listCitiesAdmin(stateId);
  const isSuper = hasRole(v, "super_admin");
  const active = cities.filter((c) => c.status === "active");
  const self = `/admin/geography/${stateId}`;
  return (
    <>
      <PageHeader title={`${st.rows[0].name} · cities`} description={`${active.length} active of ${cities.length}. Renames keep the slug and record the former name as an alias (DIR-06, DIR-08).`} actions={<Link href="/admin/geography" className="btn btn-quiet py-1.5">All states</Link>} />
      <Notice sp={sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Table head={["City", "Status", "Tier", "Localities", "Branches", "Aliases", isSuper ? "Actions" : ""]}>
          {cities.length === 0 ? <Empty>No cities.</Empty> : null}
          {cities.map((c) => (
            <tr key={c.id}>
              <Td><Link href={`/admin/geography/cities/${c.id}`} className="font-semibold underline">{c.name}</Link><div className="text-xs text-muted">/{c.slug}{c.isMetro ? " · metro" : ""}</div></Td>
              <Td><Pill status={c.status} />{c.mergedIntoCityId ? <div className="text-xs text-muted">→ {cities.find((x) => x.id === c.mergedIntoCityId)?.name ?? c.mergedIntoCityId.slice(0, 8)}</div> : null}</Td>
              <Td>{c.tier ?? "—"}</Td><Td>{c.localities}</Td><Td>{c.branches}</Td>
              <Td className="text-xs">
                {(c.aliases ?? []).join(", ") || "—"}
                {isSuper ? (
                  <form action={aliasAction} className="mt-1 flex gap-1">
                    <Hidden name="op" value="add" /><Hidden name="targetType" value="city" /><Hidden name="targetId" value={c.id} /><Hidden name="returnTo" value={self} />
                    <Input name="alias" placeholder="Add alias" aria-label={`Alias for ${c.name}`} className="w-28 py-0.5 text-xs" />
                    <button className="btn btn-quiet py-0.5 text-xs" type="submit">Add</button>
                  </form>
                ) : null}
              </Td>
              <Td>
                {isSuper && c.status !== "merged" ? (
                  <details>
                    <summary className="cursor-pointer text-sm underline">Edit / merge</summary>
                    <form action={upsertCityAction} className="mt-2 grid w-60 gap-1 text-sm">
                      <Hidden name="stateId" value={stateId} /><Hidden name="cityId" value={c.id} />
                      <Input name="name" defaultValue={c.name} required aria-label="Name" className="py-1" />
                      <Select name="status" defaultValue={c.status} aria-label="Status" className="py-1" options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
                      <div className="flex gap-1"><Input name="tier" type="number" min={1} max={3} defaultValue={c.tier ?? ""} placeholder="Tier" aria-label="Tier" className="py-1" /><label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isMetro" defaultChecked={c.isMetro} /> metro</label></div>
                      <div className="flex gap-1"><Input name="latitude" defaultValue={c.latitude ?? ""} placeholder="Lat" aria-label="Latitude" className="py-1" /><Input name="longitude" defaultValue={c.longitude ?? ""} placeholder="Lng" aria-label="Longitude" className="py-1" /></div>
                      <Input name="reason" required placeholder="Reason" aria-label="Reason" className="py-1" />
                      <button className="btn btn-secondary py-1" type="submit">Save</button>
                    </form>
                    <Sensitive viewer={v} next={self}>
                      <form action={mergeCityAction} className="mt-3 grid w-60 gap-1 border-t border-line pt-2 text-sm">
                        <Hidden name="stateId" value={stateId} /><Hidden name="sourceCityId" value={c.id} />
                        <Select name="targetCityId" aria-label="Merge into" className="py-1" options={active.filter((x) => x.id !== c.id).map((x) => ({ value: x.id, label: `Merge into ${x.name}` }))} />
                        <Input name="reason" required placeholder="Reason" aria-label="Reason" className="py-1" />
                        <ConfirmButton message={`Merge ${c.name} into the selected city? Branches and localities move; the old URL redirects. This cannot be undone.`} className="btn btn-quiet py-1 text-alert">Merge (DIR-15)</ConfirmButton>
                      </form>
                    </Sensitive>
                  </details>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
        {isSuper ? (
          <Section title="Add city">
            <form action={upsertCityAction} className="grid gap-2">
              <Hidden name="stateId" value={stateId} />
              <Field label="Name" name="name"><Input name="name" required /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Tier" name="tier"><Input name="tier" type="number" min={1} max={3} /></Field><label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="isMetro" /> Metro</label></div>
              <div className="grid grid-cols-2 gap-2"><Field label="Latitude" name="latitude"><Input name="latitude" /></Field><Field label="Longitude" name="longitude"><Input name="longitude" /></Field></div>
              <Field label="Reason" name="reason"><Input name="reason" required /></Field>
              <button className="btn btn-primary py-1.5" type="submit">Add city</button>
            </form>
          </Section>
        ) : null}
      </div>
    </>
  );
}
