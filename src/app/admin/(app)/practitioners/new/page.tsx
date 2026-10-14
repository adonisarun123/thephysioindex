import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Field, Input, Notice, Select } from "@/components/admin/ui";
import type { SP } from "@/lib/admin/format";
import { authorityOptions, geoOptions } from "@/lib/admin/practitioners";
import { requireStaff } from "@/lib/auth/session";
import { createPractitionerAction } from "../../actions/practitioners";

export default function Page({ searchParams }: PageProps<"/admin/practitioners/new">) {
  return (
    <>
      <PageHeader title="New staff-created profile" description="Creates an unclaimed draft with one clinic branch. It is never published without a listing review case, and never verified or bookable by creation alone (PRO-07, VER-04)." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/admin/practitioners/new">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff("verification_reviewer");
  const [geo, authorities] = await Promise.all([geoOptions(), authorityOptions()]);
  return (
    <>
      <Notice sp={sp} />
      <form action={createPractitionerAction} className="grid max-w-3xl gap-4">
        <section className="card grid gap-3 p-4">
          <h2 className="font-semibold">Identity</h2>
          <Field label="Full name" name="displayName"><Input name="displayName" required minLength={2} maxLength={120} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Designation" name="designation"><Input name="designation" defaultValue="Physiotherapist" maxLength={80} /></Field>
            <Field label="Gender (optional, self-declared)" name="gender"><Select name="gender" options={[{ value: "unset", label: "Not stated" }, { value: "female", label: "Female" }, { value: "male", label: "Male" }, { value: "non_binary", label: "Non-binary" }]} /></Field>
          </div>
          <Field label="Professional headline (≤160)" name="headline"><Input name="headline" maxLength={160} /></Field>
          <Field label="Practice start date" name="practiceStartDate"><Input name="practiceStartDate" type="date" /></Field>
        </section>
        <section className="card grid gap-3 p-4">
          <h2 className="font-semibold">Registration (self-declared until checked, VER-01)</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Credential type" name="credentialType"><Select name="credentialType" options={[{ value: "statutory_registration", label: "Statutory registration" }, { value: "enrolment", label: "Enrolment identifier" }, { value: "degree", label: "Degree" }, { value: "association_membership", label: "Association membership" }, { value: "certification", label: "Certification" }]} /></Field>
            <Field label="Issuing authority" name="authorityId"><Select name="authorityId" options={[{ value: "", label: "None recorded" }, ...authorities.map((a) => ({ value: a.id, label: `${a.name}${a.stateCode ? ` (${a.stateCode})` : ""}` }))]} /></Field>
            <Field label="Number (kept as text)" name="registrationNumber"><Input name="registrationNumber" maxLength={60} /></Field>
          </div>
          <Field label="Source URL (where this data was collected)" name="sourceUrl"><Input name="sourceUrl" type="url" maxLength={500} /></Field>
        </section>
        <section className="card grid gap-3 p-4">
          <h2 className="font-semibold">Clinic branch (LOC-01)</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Clinic name" name="clinicName" hint="Reused if a clinic with this name already has a branch in the city."><Input name="clinicName" required maxLength={160} /></Field>
            <Field label="Branch name" name="branchName"><Input name="branchName" required defaultValue="Main" maxLength={120} /></Field>
          </div>
          <Field label="Address line 1" name="addressLine1"><Input name="addressLine1" required maxLength={200} /></Field>
          <Field label="Address line 2" name="addressLine2"><Input name="addressLine2" maxLength={200} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="State" name="stateId"><Select name="stateId" required options={geo.states.map((s) => ({ value: s.id, label: s.name }))} /></Field>
            <Field label="City" name="cityId"><Select name="cityId" required options={geo.cities.map((c) => ({ value: c.id, label: `${c.name} (${geo.states.find((s) => s.id === c.stateId)?.code ?? ""})` }))} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Locality (must exist in master data)" name="localityName"><Input name="localityName" required maxLength={120} /></Field>
            <Field label="PIN code" name="pinCode"><Input name="pinCode" required inputMode="numeric" pattern="[1-9][0-9]{5}" maxLength={6} /></Field>
            <Field label="Public phone" name="publicPhone"><Input name="publicPhone" maxLength={20} /></Field>
          </div>
        </section>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="submitForReview" /> Submit for listing review immediately</label>
        <div><button className="btn btn-primary" type="submit">Create draft</button></div>
      </form>
    </>
  );
}
