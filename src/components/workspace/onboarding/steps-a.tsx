import Link from "next/link";
import type { AuthorityOption } from "@/lib/workspace/catalog";
import type { ProfileDraft } from "@/lib/workspace/draft";
import type { CredentialRow } from "@/lib/workspace/queries";
import { CredentialFields } from "@/components/workspace/forms/fields";
import { Empty, Field, Section, StatePill } from "@/components/workspace/forms/ui";
import { addRegistration, deleteRegistration, saveIdentity, saveQualifications } from "@/app/workspace/onboarding/actions";

/** Wizard steps 1–2: identity and credentials (PRO-02, PRO-08, VER-01). */

export function IdentityStep({ identity, isNew }: { identity: ProfileDraft["identity"] | undefined; isNew: boolean }) {
  return (
    <form action={saveIdentity}>
      <Section title="Who you are" lede="Your name, designation and a one-line headline. These are reviewed before publication; you can edit them any time in your workspace.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Display name" htmlFor="displayName" hint="2–120 characters, as patients should see it. Include “Dr” only if you hold a doctoral degree.">
              <input id="displayName" name="displayName" className="input" required minLength={2} maxLength={120} defaultValue={identity?.displayName ?? ""} />
            </Field>
          </div>
          <Field label="Designation" htmlFor="designation" hint="e.g. Physiotherapist, Senior physiotherapist, Sports physiotherapist.">
            <input id="designation" name="designation" className="input" maxLength={80} defaultValue={identity?.designation ?? "Physiotherapist"} />
          </Field>
          <Field label="Gender (optional)" htmlFor="gender" hint="Shown only as a patient filter. Never inferred.">
            <select id="gender" name="gender" className="input" defaultValue={identity?.gender ?? "unset"}>
              <option value="unset">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="non_binary">Non-binary</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Professional headline" htmlFor="headline" hint="Up to 160 characters. No outcome guarantees.">
              <input id="headline" name="headline" className="input" maxLength={160} defaultValue={identity?.headline ?? ""} placeholder="e.g. Orthopaedic and sports physiotherapist, 12 years in Bengaluru" />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary">{isNew ? "Create my draft profile" : "Save and continue"}</button>
          {!isNew ? <Link href="/workspace" className="btn btn-quiet">Go to workspace</Link> : null}
        </div>
      </Section>
    </form>
  );
}

const YEAR = new Date().getFullYear();

export function CredentialsStep({ qualifications, credentials, authorities }: { qualifications: NonNullable<ProfileDraft["qualifications"]>; credentials: CredentialRow[]; authorities: AuthorityOption[] }) {
  const rows = [...qualifications, ...Array.from({ length: Math.max(1, 3 - qualifications.length) }, () => null)];
  return (
    <>
      <form action={saveQualifications}>
        <Section title="Qualifications" lede="Degree, institution and completion year. At least one is required. Evidence stays private (PRO-08).">
          <div className="grid gap-3">
            {rows.map((q, i) => (
              <fieldset key={i} className="grid gap-2 rounded-[var(--r-sm)] border border-line p-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
                <legend className="sr-only">Qualification {i + 1}</legend>
                <Field label="Degree" htmlFor={`q-${i}-degree`}>
                  <input id={`q-${i}-degree`} name={`q[${i}].degree`} className="input" maxLength={120} defaultValue={q?.degree ?? ""} placeholder="e.g. BPT" />
                </Field>
                <Field label="Institution" htmlFor={`q-${i}-inst`}>
                  <input id={`q-${i}-inst`} name={`q[${i}].institution`} className="input" maxLength={160} defaultValue={q?.institution ?? ""} />
                </Field>
                <Field label="Year" htmlFor={`q-${i}-year`}>
                  <input id={`q-${i}-year`} name={`q[${i}].completionYear`} type="number" className="input" min={1950} max={YEAR + 6} defaultValue={q?.completionYear ?? ""} />
                </Field>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input type="checkbox" name={`q[${i}].inProgress`} defaultChecked={q?.inProgress ?? false} /> In progress
                </label>
              </fieldset>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Blank rows are ignored. Save to add more rows.</p>
          <div className="mt-4"><button type="submit" className="btn btn-secondary">Save qualifications</button></div>
        </Section>
      </form>

      <Section title="Registrations and memberships" lede="Add each credential separately. Status starts as self-declared; a reviewer updates it after checking (VER-01, VER-02).">
        {credentials.length === 0 ? (
          <Empty>No credentials yet. At least one registration or enrolment is required to submit.</Empty>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {credentials.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">{c.authorityName}</p>
                  <p className="text-muted">{c.type.replace(/_/g, " ")} · No. {c.numberOriginal}{c.expiresOn ? ` · expires ${c.expiresOn}` : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatePill state={c.status} />
                  {["self_declared", "pending"].includes(c.status) ? (
                    <form action={deleteRegistration}>
                      <input type="hidden" name="credentialId" value={c.id} />
                      <button type="submit" className="text-sm underline">Remove</button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <form action={addRegistration} className="mt-5">
          <CredentialFields authorities={authorities} />
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="submit" className="btn btn-secondary">Add credential</button>
            <Link href="/workspace/onboarding?step=practice" className="btn btn-primary">Continue to practice</Link>
          </div>
        </form>
      </Section>
    </>
  );
}
