import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { DL, Field, Hidden, Input, Notice, Pill, Section, Select, Textarea } from "@/components/admin/ui";
import { getClinic, listBranches, localitiesForCity, type BranchDetail } from "@/lib/admin/clinics";
import { fmtDateTime, type SP } from "@/lib/admin/format";
import { auditFor } from "@/lib/admin/practitioners";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { branchStatusAction, updateBranchAction, updateClinicAction } from "../../actions/clinics";

export default function Page({ params, searchParams }: PageProps<"/admin/clinics/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading clinic…</p>}>
      <Detail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Detail({ params, searchParams }: { params: PageProps<"/admin/clinics/[id]">["params"]; searchParams: PageProps<"/admin/clinics/[id]">["searchParams"] }) {
  const { id } = await params;
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff();
  const c = await getClinic(id);
  if (!c) notFound();
  const [branches, audit] = await Promise.all([listBranches(id), auditFor("clinic", id, 20)]);
  const canEdit = hasRole(v, "verification_reviewer");
  const isSuper = hasRole(v, "super_admin");
  const localityLists = await Promise.all(Array.from(new Set(branches.map((b) => b.cityId))).map(async (cityId) => [cityId, await localitiesForCity(cityId)] as const));
  const localitiesByCity = new Map(localityLists);

  return (
    <>
      <PageHeader title={c.name} description={`${c.publicId} · ${branches.length} branch${branches.length === 1 ? "" : "es"}`} actions={c.status === "published" ? <Link className="btn btn-quiet py-1.5" href={`/clinics/${c.slug}-${c.publicId}`} target="_blank">Public page</Link> : null} />
      <Notice sp={sp} />
      <div className="flex gap-2"><Pill status={c.status} />{c.openClaimCases ? <Pill status="open" label={`${c.openClaimCases} open ownership case(s)`} /> : null}</div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div>
          {branches.map((b) => <Branch key={b.id} clinicId={id} b={b} canEdit={canEdit} isSuper={isSuper} localities={localitiesByCity.get(b.cityId) ?? []} />)}
          {branches.length === 0 ? <Section title="Branches"><p className="text-sm text-muted">No branches. Branches are created through practitioner onboarding, imports or staff-created profiles.</p></Section> : null}
          <Section title="Audit">
            <ul className="divide-y divide-line text-sm">
              {audit.length === 0 ? <li className="py-2 text-muted">No audit events.</li> : null}
              {audit.map((a) => <li key={a.id} className="py-1.5"><span className="text-xs text-muted">{fmtDateTime(a.occurredAt)}</span> <code className="text-xs">{a.action}</code> <span className="text-muted">by {a.actorName ?? "system"}</span>{a.reason ? <div className="text-ink-2">{a.reason}</div> : null}</li>)}
            </ul>
          </Section>
        </div>
        <aside>
          <Section title="Ownership (LOC-03)">
            <DL items={[["Owner", c.ownerName ?? "Unclaimed — coordinators receive branch permissions only after a reviewed claim or an owner invitation"], ["Contact", c.ownerContact ?? "—"], ["Created", fmtDateTime(c.createdAt)]]} />
          </Section>
          <Section title="Clinic record">
            {canEdit ? (
              <form action={updateClinicAction} className="grid gap-2">
                <Hidden name="clinicId" value={id} />
                <Field label="Name" name="name"><Input name="name" required defaultValue={c.name} maxLength={160} /></Field>
                <Field label="Legal name" name="legalName"><Input name="legalName" defaultValue={c.legalName ?? ""} maxLength={200} /></Field>
                <Field label="Public phone" name="publicPhone"><Input name="publicPhone" defaultValue={c.publicPhone ?? ""} /></Field>
                <Field label="Public email" name="publicEmail"><Input name="publicEmail" type="email" defaultValue={c.publicEmail ?? ""} /></Field>
                <Field label="Website" name="website"><Input name="website" defaultValue={c.website ?? ""} /></Field>
                <Field label="About" name="about"><Textarea name="about" defaultValue={c.about ?? ""} rows={3} /></Field>
                <Field label="Status" name="status"><Select name="status" defaultValue={c.status} options={["draft", "published", ...(isSuper ? ["suspended", "archived"] : [])].map((s) => ({ value: s, label: s }))} /></Field>
                <Field label="Reason" name="reason"><Textarea name="reason" required rows={2} /></Field>
                <button className="btn btn-secondary py-1.5" type="submit">Save clinic</button>
              </form>
            ) : (
              <DL items={[["Legal name", c.legalName], ["Phone", c.publicPhone], ["Email", c.publicEmail], ["Website", c.website]]} />
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}

function Branch({ clinicId, b, canEdit, isSuper, localities }: { clinicId: string; b: BranchDetail; canEdit: boolean; isSuper: boolean; localities: { id: string; name: string }[] }) {
  return (
    <Section id={`branch-${b.id}`} title={`${b.name} · ${b.localityName}, ${b.cityName}`} actions={<Pill status={b.status} />}>
      <DL items={[["Address", `${b.addressLine1}${b.addressLine2 ? ", " + b.addressLine2 : ""}, ${b.localityName}, ${b.cityName}, ${b.stateName} ${b.pinCode}`], ["Coordinates", b.latitude != null ? `${b.latitude}, ${b.longitude}` : "not set"], ["Phone", b.publicPhone ?? "—"], ["Facilities", b.facilities?.join(", ") || "—"]]} />
      <h3 className="mt-3 text-sm font-semibold">Practitioners at this branch</h3>
      <ul className="text-sm">
        {b.practitioners.length === 0 ? <li className="text-muted">None</li> : null}
        {b.practitioners.map((p) => <li key={p.id} className="flex gap-2"><Link href={`/admin/practitioners/${p.practitionerId}`} className="underline">{p.name}</Link><Pill status={p.state} /><Pill status={p.listingStatus} />{!p.bookable ? <span className="text-xs text-muted">not bookable here</span> : null}</li>)}
      </ul>
      {canEdit ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm underline">Edit branch</summary>
          <form action={updateBranchAction} className="mt-2 grid gap-2 sm:grid-cols-2">
            <Hidden name="clinicId" value={clinicId} /><Hidden name="branchId" value={b.id} />
            <Field label="Branch name" name={`name-${b.id}`}><Input name="name" id={`name-${b.id}`} required defaultValue={b.name} /></Field>
            <Field label="Locality (DIR-15)" name={`loc-${b.id}`}><Select name="localityId" id={`loc-${b.id}`} defaultValue={b.localityId} options={localities.map((l) => ({ value: l.id, label: l.name }))} /></Field>
            <Field label="Address line 1" name={`a1-${b.id}`}><Input name="addressLine1" id={`a1-${b.id}`} required defaultValue={b.addressLine1} /></Field>
            <Field label="Address line 2" name={`a2-${b.id}`}><Input name="addressLine2" id={`a2-${b.id}`} defaultValue={b.addressLine2 ?? ""} /></Field>
            <Field label="PIN" name={`pin-${b.id}`}><Input name="pinCode" id={`pin-${b.id}`} required pattern="[1-9][0-9]{5}" defaultValue={b.pinCode} /></Field>
            <Field label="Phone" name={`ph-${b.id}`}><Input name="publicPhone" id={`ph-${b.id}`} defaultValue={b.publicPhone ?? ""} /></Field>
            <Field label="Latitude" name={`lat-${b.id}`}><Input name="latitude" id={`lat-${b.id}`} defaultValue={b.latitude ?? ""} /></Field>
            <Field label="Longitude" name={`lng-${b.id}`}><Input name="longitude" id={`lng-${b.id}`} defaultValue={b.longitude ?? ""} /></Field>
            <Field label="Facilities (comma separated)" name={`fac-${b.id}`}><Input name="facilities" id={`fac-${b.id}`} defaultValue={b.facilities?.join(", ") ?? ""} /></Field>
            <Field label="Directions" name={`dir-${b.id}`}><Input name="directions" id={`dir-${b.id}`} defaultValue={b.directions ?? ""} /></Field>
            <div className="sm:col-span-2"><Field label="Working hours JSON (weekday 0=Sun … 6=Sat). Clinic hours are not practitioner availability (LOC-03)." name={`wh-${b.id}`}><Textarea name="workingHours" id={`wh-${b.id}`} rows={2} defaultValue={b.workingHours ? JSON.stringify(b.workingHours) : ""} /></Field></div>
            <div className="sm:col-span-2"><Field label="Reason" name={`r-${b.id}`}><Textarea name="reason" id={`r-${b.id}`} required rows={2} /></Field></div>
            <div><button className="btn btn-secondary py-1.5" type="submit">Save branch</button></div>
          </form>
        </details>
      ) : null}
      {canEdit ? (
        <form action={branchStatusAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3 text-sm">
          <Hidden name="clinicId" value={clinicId} /><Hidden name="branchId" value={b.id} />
          <Select name="status" aria-label="Branch status" defaultValue={b.status} className="w-40 py-1.5" options={["draft", "published", ...(isSuper ? ["suspended", "archived"] : [])].map((s) => ({ value: s, label: s }))} />
          <Input name="reason" required placeholder="Reason" className="w-72 py-1.5" aria-label="Reason" />
          <button className="btn btn-quiet py-1.5" type="submit">Set branch status</button>
        </form>
      ) : null}
    </Section>
  );
}
