import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Field, Hidden, Input, Notice, Pill, Section, Select, Table, Td, Textarea } from "@/components/admin/ui";
import { fmtDateTime, type SP } from "@/lib/admin/format";
import { listAuthorities, listPolicies, type AuthorityRow } from "@/lib/admin/master";
import { geoOptions } from "@/lib/admin/practitioners";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { upsertAuthorityAction, upsertJurisdictionPolicyAction } from "../actions/master";

export default function Page({ searchParams }: PageProps<"/admin/authorities">) {
  return (
    <>
      <PageHeader title="Credential authorities" description="Statutory regulators, enrolment bodies, degree awarders and associations (VER-01), with the per-jurisdiction policy that decides which credentials can make a profile bookable (VER-03)." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const KINDS = ["statutory_regulator", "enrolment_body", "degree_awarding", "professional_association", "other"];

async function Body({ searchParams }: { searchParams: PageProps<"/admin/authorities">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff();
  const [authorities, policies, geo] = await Promise.all([listAuthorities(), listPolicies("jurisdiction"), geoOptions()]);
  const isSuper = hasRole(v, "super_admin");
  const current = policies.filter((p) => !p.supersededAt);
  const byState = new Map(current.map((p) => [p.stateId ?? "national", p]));
  return (
    <>
      <Notice sp={sp} />
      <Table head={["Authority", "Kind", "Jurisdiction", "Accepted for booking", "Public label", "Lookup", "Policy version", "Credentials", "Active", isSuper ? "Edit" : ""]}>
        {authorities.length === 0 ? <Empty>No authorities.</Empty> : null}
        {authorities.map((a) => (
          <tr key={a.id}>
            <Td className="font-semibold">{a.name}{a.shortName ? <div className="text-xs text-muted">{a.shortName}</div> : null}</Td>
            <Td className="text-xs">{a.kind.replace(/_/g, " ")}</Td>
            <Td className="text-xs">{a.stateName ?? "National"}</Td>
            <Td>{a.acceptedForBooking ? <Pill status="approved" label="Yes" /> : <Pill status="draft" label="No" />}</Td>
            <Td className="text-xs">{a.publicLabel ?? "—"}</Td>
            <Td className="text-xs">{a.lookupUrl ? <a href={a.lookupUrl} className="underline" target="_blank" rel="noreferrer noopener">register</a> : "none"}</Td>
            <Td className="text-xs">{a.policyVersion}</Td>
            <Td>{a.credentials}</Td>
            <Td><Pill status={a.active ? "active" : "inactive"} /></Td>
            <Td>{isSuper ? <details><summary className="cursor-pointer text-sm underline">Edit</summary><AuthorityForm a={a} states={geo.states} /></details> : null}</Td>
          </tr>
        ))}
      </Table>

      <div className="grid gap-4 lg:grid-cols-2">
        {isSuper ? <Section title="Add authority"><AuthorityForm states={geo.states} /></Section> : null}
        <Section id="jurisdiction" title="Jurisdiction policies (VER-03)">
          <p className="mb-2 text-xs text-muted">A state inherits the national default until it has its own policy. Enabling booking in a state is an operations decision validated per jurisdiction (Section 30). Each save creates a new version.</p>
          <Table head={["Jurisdiction", "Version", "Booking enabled", "Accepted kinds", "Effective"]}>
            {current.map((p) => (
              <tr key={p.id}>
                <Td>{p.stateName ?? "National default"}</Td><Td className="text-xs">{p.version}</Td>
                <Td>{(p.content as { bookingEnabled?: boolean }).bookingEnabled ? <Pill status="approved" label="Enabled" /> : <Pill status="draft" label="Disabled" />}</Td>
                <Td className="text-xs">{((p.content as { acceptedCredentialKinds?: string[] }).acceptedCredentialKinds ?? []).map((k) => k.replace(/_/g, " ")).join(", ") || "—"}</Td>
                <Td className="text-xs">{fmtDateTime(p.effectiveAt)}</Td>
              </tr>
            ))}
          </Table>
          {isSuper ? (
            <form action={upsertJurisdictionPolicyAction} className="mt-3 grid gap-2">
              <Field label="Jurisdiction" name="stateId"><Select name="stateId" options={[{ value: "", label: "National default" }, ...geo.states.map((s) => ({ value: s.id, label: `${s.name}${byState.has(s.id) ? "" : " (inherits national)"}` }))]} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="bookingEnabled" /> Booking enabled in this jurisdiction</label>
              <fieldset className="text-sm"><legend className="label">Accepted credential kinds for booking</legend>{KINDS.map((k) => <label key={k} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" name="acceptedCredentialKinds" value={k} defaultChecked={k === "statutory_regulator"} /> {k.replace(/_/g, " ")}</label>)}</fieldset>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="exceptionAllowed" defaultChecked /> Reviewed exceptions allowed where no regulatory route exists</label>
              <Field label="Note" name="note"><Input name="note" /></Field>
              <Field label="Reason" name="reason"><Textarea name="reason" required rows={2} /></Field>
              <button className="btn btn-primary py-1.5" type="submit">Publish new policy version</button>
            </form>
          ) : null}
        </Section>
      </div>
    </>
  );
}

function AuthorityForm({ a, states }: { a?: AuthorityRow; states: { id: string; name: string }[] }) {
  return (
    <form action={upsertAuthorityAction} className="mt-2 grid gap-2 text-sm">
      {a ? <Hidden name="id" value={a.id} /> : null}
      <Field label="Name" name={`name-${a?.id ?? "new"}`}><Input id={`name-${a?.id ?? "new"}`} name="name" required defaultValue={a?.name ?? ""} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Short name" name={`short-${a?.id ?? "new"}`}><Input id={`short-${a?.id ?? "new"}`} name="shortName" defaultValue={a?.shortName ?? ""} /></Field>
        <Field label="Kind" name={`kind-${a?.id ?? "new"}`}><Select id={`kind-${a?.id ?? "new"}`} name="kind" defaultValue={a?.kind ?? "statutory_regulator"} options={KINDS.map((k) => ({ value: k, label: k.replace(/_/g, " ") }))} /></Field>
      </div>
      <Field label="Jurisdiction" name={`st-${a?.id ?? "new"}`}><Select id={`st-${a?.id ?? "new"}`} name="jurisdictionStateId" defaultValue={a?.jurisdictionStateId ?? ""} options={[{ value: "", label: "National" }, ...states.map((s) => ({ value: s.id, label: s.name }))]} /></Field>
      <Field label="Official URL" name={`ou-${a?.id ?? "new"}`}><Input id={`ou-${a?.id ?? "new"}`} name="officialUrl" defaultValue={a?.officialUrl ?? ""} /></Field>
      <Field label="Public register lookup URL" name={`lu-${a?.id ?? "new"}`}><Input id={`lu-${a?.id ?? "new"}`} name="lookupUrl" defaultValue={a?.lookupUrl ?? ""} /></Field>
      <Field label="Public label (shown to patients)" name={`pl-${a?.id ?? "new"}`}><Input id={`pl-${a?.id ?? "new"}`} name="publicLabel" defaultValue={a?.publicLabel ?? ""} /></Field>
      <label className="flex items-center gap-2"><input type="checkbox" name="acceptedForBooking" defaultChecked={a?.acceptedForBooking ?? false} /> Accepted for booking eligibility (subject to jurisdiction policy)</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={a?.active ?? true} /> Active</label>
      <Field label="Reason" name={`r-${a?.id ?? "new"}`}><Input id={`r-${a?.id ?? "new"}`} name="reason" required /></Field>
      <button className={`btn py-1.5 ${a ? "btn-secondary" : "btn-primary"}`} type="submit">{a ? "Save" : "Add authority"}</button>
    </form>
  );
}
