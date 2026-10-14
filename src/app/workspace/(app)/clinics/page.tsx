import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ClinicFields, OfferingFields } from "@/components/workspace/forms/fields";
import { Empty, Field, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { formatPaise } from "@/lib/money";
import { listCityOptions, listLocalityOptions, listServiceOptions, listStateOptions, offeringDefaults, searchBranches } from "@/lib/workspace/catalog";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { listAssociations, type AssociationRow } from "@/lib/workspace/queries";
import { addOfferingAction, contactRulesAction, createClinicAction, endAssociationAction, joinBranchAction, reviseOfferingAction, toggleOfferingAction } from "./actions";

export const metadata: Metadata = { title: "Clinics and services" };

export default function Page({ searchParams }: PageProps<"/workspace/clinics">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Clinics searchParams={searchParams} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/i;
const PAGE = "/workspace/clinics";

async function Clinics({ searchParams }: { searchParams: PageProps<"/workspace/clinics">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace(PAGE);
  const clinicQ = typeof sp.clinicQ === "string" ? sp.clinicQ.trim() : "";
  const clinicCity = typeof sp.clinicCity === "string" ? sp.clinicCity.trim() : "";
  const stateId = typeof sp.stateId === "string" && UUID.test(sp.stateId) ? sp.stateId : undefined;
  const cityId = typeof sp.cityId === "string" && UUID.test(sp.cityId) ? sp.cityId : undefined;
  const editId = typeof sp.edit === "string" && UUID.test(sp.edit) ? sp.edit : undefined;
  const [associations, services, defaults, hits, states, cities, localities] = await Promise.all([
    listAssociations(p.id),
    listServiceOptions(),
    offeringDefaults(),
    clinicQ ? searchBranches(clinicQ, clinicCity || undefined) : Promise.resolve([]),
    listStateOptions(),
    stateId ? listCityOptions(stateId) : Promise.resolve([]),
    cityId ? listLocalityOptions(cityId) : Promise.resolve([]),
  ]);
  const msg = readMessage(sp);
  const editing = editId ? associations.flatMap((a) => a.offerings.map((o) => ({ a, o }))).find((x) => x.o.id === editId) : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Clinics and services" lede="Where you practise and what you offer. Associations and clinic details are approved by our team; offerings are yours to manage within platform bounds." action={<a href="#add" className="btn btn-secondary py-2 text-sm">Add a clinic</a>} />
      <Notice ok={msg.ok} error={msg.error} />

      {editing ? (
        <form action={reviseOfferingAction}>
          <Section title={`Edit ${editing.o.displayName}`} lede={`${editing.a.clinicName} · saving creates version ${(editing.o.version ?? 0) + 1}; bookings keep the version they accepted (CAL-02).`} aside={<Link href={PAGE} className="text-sm underline">Cancel</Link>}>
            <input type="hidden" name="offeringId" value={editing.o.id} />
            <OfferingFields services={services} defaults={defaults} value={editing.o} />
            <div className="mt-4"><button type="submit" className="btn btn-primary">Save new version</button></div>
          </Section>
        </form>
      ) : null}

      {associations.length === 0 ? <Section title="Your clinics"><Empty>No clinic yet. Join an existing clinic or add a new one below.</Empty></Section> : associations.map((a) => <Association key={a.id} a={a} services={services} defaults={defaults} />)}

      <Section id="add" title="Join an existing clinic" lede="Search by clinic name so we do not create duplicates (LOC-02).">
        <form method="get" action={PAGE} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <Field label="Clinic name" htmlFor="clinicQ"><input id="clinicQ" name="clinicQ" className="input" defaultValue={clinicQ} minLength={2} /></Field>
          <Field label="City (optional)" htmlFor="clinicCity"><input id="clinicCity" name="clinicCity" className="input" defaultValue={clinicCity} /></Field>
          <button type="submit" className="btn btn-secondary">Search</button>
        </form>
        {clinicQ ? (
          hits.length === 0 ? <p className="mt-3 text-sm text-muted">No clinics match.</p> : (
            <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
              {hits.map((h) => (
                <li key={h.branchId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{h.clinicName}{h.branchName !== h.clinicName ? ` — ${h.branchName}` : ""}</p>
                    <p className="text-muted">{h.address}, {h.localityName}, {h.cityName} {h.pinCode}</p>
                  </div>
                  <form action={joinBranchAction}><input type="hidden" name="branchId" value={h.branchId} /><button type="submit" className="btn btn-quiet py-1.5 text-sm">Join this branch</button></form>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Section>

      <form action={createClinicAction}>
        <Section title="Add a new clinic" lede="Complete address, state, city, locality and six-digit PIN (LOC-01). The branch is reviewed before it is published.">
          <ClinicFields states={states} cities={cities} localities={localities} selected={{ stateId, cityId }} reloadAction={`${PAGE}#add`} />
          <div className="mt-5"><button type="submit" className="btn btn-primary">Add clinic</button></div>
        </Section>
      </form>
    </div>
  );
}

function Association({ a, services, defaults }: { a: AssociationRow; services: Awaited<ReturnType<typeof listServiceOptions>>; defaults: Awaited<ReturnType<typeof offeringDefaults>> }) {
  const ended = a.state === "ended";
  return (
    <Section
      id={`assoc-${a.id}`}
      title={`${a.clinicName}${a.branchName !== a.clinicName ? ` — ${a.branchName}` : ""}`}
      lede={`${a.address}, ${a.localityName}, ${a.cityName} ${a.pinCode} · since ${a.activeFrom}${a.activeTo ? ` · ended ${a.activeTo}` : ""}`}
      aside={<StatePill state={a.state} />}
    >
      {a.state === "pending" ? <p className="mb-3 text-sm text-muted">Waiting for approval. You can set up services now; they publish with the association (LOC-03).</p> : null}
      {a.offerings.length === 0 ? (
        <Empty>No services at this branch yet.</Empty>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Services at {a.clinicName}</caption>
          <thead><tr className="text-left text-muted"><th className="py-1 font-normal">Service</th><th className="py-1 font-normal">Timing</th><th className="py-1 text-right font-normal">Fee</th><th className="py-1 text-right font-normal">Status</th><th className="sr-only">Actions</th></tr></thead>
          <tbody>
            {a.offerings.map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="py-2"><span className="font-medium">{o.displayName}</span><span className="block text-muted">{o.serviceLabel}{o.priceNote ? ` · ${o.priceNote}` : ""} · v{o.version ?? "—"}</span></td>
                <td className="py-2 text-muted">{o.durationMin} min · every {o.intervalMin} min · buffers {o.bufferBeforeMin}/{o.bufferAfterMin}</td>
                <td className="py-2 text-right">{formatPaise(o.basePricePaise)}{o.taxPaise + o.extraChargesPaise ? <span className="block text-xs text-muted">+ {formatPaise(o.taxPaise + o.extraChargesPaise)}</span> : null}</td>
                <td className="py-2 text-right"><StatePill state={o.active ? "active" : "inactive"} /></td>
                <td className="py-2 text-right">
                  {!ended ? (
                    <div className="flex justify-end gap-3">
                      <Link href={`${PAGE}?edit=${o.id}`} className="underline">Edit</Link>
                      <form action={toggleOfferingAction}>
                        <input type="hidden" name="offeringId" value={o.id} />
                        <input type="hidden" name="active" value={o.active ? "0" : "1"} />
                        <button type="submit" className="underline">{o.active ? "Deactivate" : "Activate"}</button>
                      </form>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!ended ? (
        <div className="mt-4 grid gap-4">
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand-ink">Add a service at this branch</summary>
            <form action={addOfferingAction} className="mt-3">
              <input type="hidden" name="associationId" value={a.id} />
              <OfferingFields services={services} defaults={defaults} idPrefix={`o-${a.id}-`} />
              <div className="mt-4"><button type="submit" className="btn btn-secondary py-2 text-sm">Add service</button></div>
            </form>
          </details>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand-ink">Public contact and association</summary>
            <form action={contactRulesAction} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <input type="hidden" name="associationId" value={a.id} />
              <input type="hidden" name="back" value={PAGE} />
              <label className="flex items-center gap-2"><input type="checkbox" name="showBranchPhone" defaultChecked={a.showBranchPhone} /> Show the clinic phone {a.branchPhone ? `(${a.branchPhone})` : ""} on my profile</label>
              <button type="submit" className="btn btn-quiet py-1 text-xs">Save</button>
            </form>
            <form action={endAssociationAction} className="mt-4 grid gap-2 rounded-[var(--r-sm)] border border-alert bg-alert-soft p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="associationId" value={a.id} />
              <Field label="End my association with this branch — reason (optional)" htmlFor={`reason-${a.id}`} hint="Stops new bookings here. Existing appointments are never cancelled silently; a task is created for any future ones (LOC-02).">
                <input id={`reason-${a.id}`} name="reason" className="input" maxLength={200} />
              </Field>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2"><input type="checkbox" name="confirm" required /> I understand</label>
                <button type="submit" className="btn btn-quiet py-1.5 text-sm">End association</button>
              </div>
            </form>
          </details>
        </div>
      ) : null}
    </Section>
  );
}
