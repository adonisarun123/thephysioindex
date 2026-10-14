import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Empty, Field, Hidden, Input, Notice, Pill, Section, Select, Sensitive, Table, Td } from "@/components/admin/ui";
import type { SP } from "@/lib/admin/format";
import { getCityAdmin, listLocalitiesAdmin } from "@/lib/admin/master";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { aliasAction, mergeLocalityAction, upsertLocalityAction } from "../../../actions/geography";

export default function Page({ params, searchParams }: PageProps<"/admin/geography/cities/[cityId]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Localities params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Localities({ params, searchParams }: { params: PageProps<"/admin/geography/cities/[cityId]">["params"]; searchParams: PageProps<"/admin/geography/cities/[cityId]">["searchParams"] }) {
  const { cityId } = await params;
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff();
  const city = await getCityAdmin(cityId);
  if (!city) notFound();
  const localities = await listLocalitiesAdmin(cityId);
  const isSuper = hasRole(v, "super_admin");
  const active = localities.filter((l) => l.status === "active");
  const self = `/admin/geography/cities/${cityId}`;
  return (
    <>
      <PageHeader title={`${city.name}, ${city.stateCode} · localities`} description={`${active.length} active of ${localities.length}. New localities proposed during onboarding arrive as review cases rather than silently creating pages (DIR-08).`} actions={<Link href={`/admin/geography/${city.stateId}`} className="btn btn-quiet py-1.5">{city.stateName} cities</Link>} />
      <Notice sp={sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Table head={["Locality", "Status", "PIN codes", "Branches", "Aliases", isSuper ? "Actions" : ""]}>
          {localities.length === 0 ? <Empty>No localities.</Empty> : null}
          {localities.map((l) => (
            <tr key={l.id}>
              <Td><span className="font-semibold">{l.name}</span><div className="text-xs text-muted">/{l.slug} · {l.id}</div></Td>
              <Td><Pill status={l.status} />{l.mergedIntoLocalityId ? <div className="text-xs text-muted">→ {localities.find((x) => x.id === l.mergedIntoLocalityId)?.name ?? "merged"}</div> : null}</Td>
              <Td className="text-xs">{(l.pinCodes ?? []).join(", ") || "—"}</Td>
              <Td>{l.branches}</Td>
              <Td className="text-xs">
                <ul>{l.aliases.map((a) => <li key={a.id} className="flex items-center gap-1">{a.alias} <span className="text-muted">({a.kind.replace("_", " ")})</span>{isSuper ? <form action={aliasAction}><Hidden name="op" value="remove" /><Hidden name="targetType" value="locality" /><Hidden name="targetId" value={l.id} /><Hidden name="aliasId" value={a.id} /><Hidden name="returnTo" value={self} /><button className="text-alert underline" type="submit" aria-label={`Remove alias ${a.alias}`}>×</button></form> : null}</li>)}</ul>
                {isSuper ? (
                  <form action={aliasAction} className="mt-1 flex gap-1">
                    <Hidden name="op" value="add" /><Hidden name="targetType" value="locality" /><Hidden name="targetId" value={l.id} /><Hidden name="returnTo" value={self} />
                    <Input name="alias" placeholder="Add alias" aria-label={`Alias for ${l.name}`} className="w-24 py-0.5 text-xs" />
                    <Select name="kind" aria-label="Alias kind" className="w-28 py-0.5 text-xs" options={["spelling", "former_name", "abbreviation", "local_language", "colloquial"].map((k) => ({ value: k, label: k.replace("_", " ") }))} />
                    <button className="btn btn-quiet py-0.5 text-xs" type="submit">Add</button>
                  </form>
                ) : null}
              </Td>
              <Td>
                {isSuper && l.status !== "merged" ? (
                  <details>
                    <summary className="cursor-pointer text-sm underline">Edit / merge</summary>
                    <form action={upsertLocalityAction} className="mt-2 grid w-60 gap-1 text-sm">
                      <Hidden name="cityId" value={cityId} /><Hidden name="localityId" value={l.id} />
                      <Input name="name" defaultValue={l.name} required aria-label="Name" className="py-1" />
                      <Select name="status" defaultValue={l.status} aria-label="Status" className="py-1" options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
                      <Input name="pinCodes" defaultValue={(l.pinCodes ?? []).join(", ")} placeholder="PIN codes, comma separated" aria-label="PIN codes" className="py-1" />
                      <div className="flex gap-1"><Input name="latitude" defaultValue={l.latitude ?? ""} placeholder="Lat" aria-label="Latitude" className="py-1" /><Input name="longitude" defaultValue={l.longitude ?? ""} placeholder="Lng" aria-label="Longitude" className="py-1" /></div>
                      <Input name="reason" required placeholder="Reason" aria-label="Reason" className="py-1" />
                      <button className="btn btn-secondary py-1" type="submit">Save</button>
                    </form>
                    <Sensitive viewer={v} next={self}>
                      <form action={mergeLocalityAction} className="mt-3 grid w-60 gap-1 border-t border-line pt-2 text-sm">
                        <Hidden name="cityId" value={cityId} /><Hidden name="sourceLocalityId" value={l.id} />
                        <Select name="targetLocalityId" aria-label="Merge into" className="py-1" options={active.filter((x) => x.id !== l.id).map((x) => ({ value: x.id, label: `Merge into ${x.name}` }))} />
                        <Input name="reason" required placeholder="Reason" aria-label="Reason" className="py-1" />
                        <ConfirmButton message={`Merge ${l.name} into the selected locality? ${l.branches} branch(es) move and the old URL redirects.`} className="btn btn-quiet py-1 text-alert">Merge (DIR-15)</ConfirmButton>
                      </form>
                    </Sensitive>
                  </details>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
        {isSuper ? (
          <Section title="Add locality">
            <form action={upsertLocalityAction} className="grid gap-2">
              <Hidden name="cityId" value={cityId} />
              <Field label="Name" name="name"><Input name="name" required /></Field>
              <Field label="PIN codes (comma separated)" name="pinCodes"><Input name="pinCodes" /></Field>
              <div className="grid grid-cols-2 gap-2"><Field label="Latitude" name="latitude"><Input name="latitude" /></Field><Field label="Longitude" name="longitude"><Input name="longitude" /></Field></div>
              <Field label="Reason" name="reason"><Input name="reason" required /></Field>
              <button className="btn btn-primary py-1.5" type="submit">Add locality</button>
            </form>
          </Section>
        ) : null}
      </div>
    </>
  );
}
