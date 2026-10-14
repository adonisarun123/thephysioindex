import Link from "next/link";
import type { BranchHit, OfferingDefaults, Option } from "@/lib/workspace/catalog";
import type { ProfileDraft } from "@/lib/workspace/draft";
import { formatPaise } from "@/lib/money";
import type { OnboardingStatus } from "@/lib/workspace/onboarding";
import type { AssociationRow } from "@/lib/workspace/queries";
import { ClinicFields, OfferingFields } from "@/components/workspace/forms/fields";
import { Empty, Field, Section, StatePill } from "@/components/workspace/forms/ui";
import { addService, createClinic, joinExistingBranch, saveConsent, saveExpertise, submitListing } from "@/app/workspace/onboarding/actions";

/** Wizard steps 3–6: practice, services and expertise, consent, review (LOC-01, CAL-02, PRO-03). */

export function PracticeStep(props: {
  associations: AssociationRow[];
  hits: BranchHit[];
  query: { clinicQ: string; clinicCity: string; stateId?: string; cityId?: string };
  states: Option[];
  cities: Option[];
  localities: Option[];
}) {
  const live = props.associations.filter((a) => a.state !== "ended");
  const reload = `/workspace/onboarding?step=practice`;
  return (
    <>
      <Section title="Your clinics" lede="Where you see patients. Associations are approved by our team before they appear publicly (LOC-02).">
        {live.length === 0 ? <Empty>No clinic yet. Join an existing clinic or add a new one below.</Empty> : <AssociationList items={live} />}
      </Section>

      <Section title="Join an existing clinic" lede="Search by clinic name. If your clinic is already listed, join its branch rather than creating a duplicate.">
        <form method="get" action="/workspace/onboarding" className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <input type="hidden" name="step" value="practice" />
          <Field label="Clinic name" htmlFor="clinicQ">
            <input id="clinicQ" name="clinicQ" className="input" defaultValue={props.query.clinicQ} minLength={2} />
          </Field>
          <Field label="City (optional)" htmlFor="clinicCity">
            <input id="clinicCity" name="clinicCity" className="input" defaultValue={props.query.clinicCity} />
          </Field>
          <button type="submit" className="btn btn-secondary">Search</button>
        </form>
        {props.query.clinicQ ? (
          props.hits.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No clinics match. Add yours below.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {props.hits.map((h) => (
                <li key={h.branchId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium">{h.clinicName}{h.branchName !== h.clinicName ? ` — ${h.branchName}` : ""}</p>
                    <p className="text-muted">{h.address}, {h.localityName}, {h.cityName} {h.pinCode}</p>
                  </div>
                  <form action={joinExistingBranch}>
                    <input type="hidden" name="branchId" value={h.branchId} />
                    <button type="submit" className="btn btn-quiet py-1.5 text-sm">Join this branch</button>
                  </form>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Section>

      <form action={createClinic}>
        <Section title="Add a new clinic" lede="Complete address, state, city, locality and PIN code (LOC-01).">
          <ClinicFields states={props.states} cities={props.cities} localities={props.localities} selected={{ stateId: props.query.stateId, cityId: props.query.cityId }} reloadAction={reload} />
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" className="btn btn-secondary">Add clinic</button>
            {live.length > 0 ? <Link href="/workspace/onboarding?step=services" className="btn btn-primary">Continue to services</Link> : null}
          </div>
        </Section>
      </form>
    </>
  );
}

export function AssociationList({ items }: { items: AssociationRow[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <div>
            <p className="font-medium">{a.clinicName}{a.branchName !== a.clinicName ? ` — ${a.branchName}` : ""}</p>
            <p className="text-muted">{a.address}, {a.localityName}, {a.cityName} {a.pinCode}</p>
          </div>
          <StatePill state={a.state} />
        </li>
      ))}
    </ul>
  );
}

export function ServicesStep(props: { associations: AssociationRow[]; services: Option[]; defaults: OfferingDefaults; draft: ProfileDraft; specialties: Option[]; languages: Option[] }) {
  const live = props.associations.filter((a) => a.state !== "ended" && a.state !== "rejected");
  const chosen = new Set((props.draft.specialties ?? []).map((s) => s.specialtyId));
  const primary = props.draft.specialties?.find((s) => s.isPrimary)?.specialtyId ?? "";
  const langs = new Set(props.draft.languages ?? []);
  return (
    <>
      <Section title="Services and fees" lede="One service per clinic branch. Duration, interval and buffers default to platform values and are validated independently (CAL-03). Fees are in rupees, pay at clinic.">
        {live.length === 0 ? (
          <Empty>Add a clinic first — services belong to a clinic branch. <Link href="/workspace/onboarding?step=practice" className="underline">Go to practice</Link>.</Empty>
        ) : (
          <div className="grid gap-6">
            {live.map((a) => (
              <div key={a.id}>
                <h3 className="font-semibold">{a.clinicName}{a.branchName !== a.clinicName ? ` — ${a.branchName}` : ""} <span className="text-sm font-normal text-muted">· {a.localityName}, {a.cityName}</span></h3>
                {a.offerings.length ? (
                  <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
                    {a.offerings.map((o) => (
                      <li key={o.id} className="flex justify-between gap-3 py-2">
                        <span>{o.displayName} <span className="text-muted">· {o.durationMin} min</span></span>
                        <span className="font-medium">{formatPaise(o.basePricePaise)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted">No services yet at this branch.</p>
                )}
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-brand-ink">Add a service here</summary>
                  <form action={addService} className="mt-3">
                    <input type="hidden" name="associationId" value={a.id} />
                    <OfferingFields services={props.services} defaults={props.defaults} idPrefix={`o-${a.id}-`} />
                    <div className="mt-4"><button type="submit" className="btn btn-secondary">Add service</button></div>
                  </form>
                </details>
              </div>
            ))}
          </div>
        )}
      </Section>

      <form action={saveExpertise}>
        <Section title="Areas of practice, languages and about" lede="Choose from the controlled taxonomy, mark one primary area, list the languages you consult in and write your About section (100–3000 characters, plain text).">
          <div className="grid gap-5">
            <div>
              <p className="label">Areas of practice</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {props.specialties.map((s) => (
                  <li key={s.id} className="flex items-start gap-2 text-sm">
                    <input id={`sp-${s.id}`} type="checkbox" name="specialtyIds" value={s.id} defaultChecked={chosen.has(s.id)} className="mt-1" />
                    <label htmlFor={`sp-${s.id}`}><span className="font-medium">{s.label}</span>{s.hint ? <span className="block text-xs text-muted">{s.hint}</span> : null}</label>
                  </li>
                ))}
              </ul>
            </div>
            <Field label="Primary area of practice" htmlFor="primarySpecialtyId" hint="Exactly one. It leads your public profile.">
              <select id="primarySpecialtyId" name="primarySpecialtyId" className="input" defaultValue={primary} required>
                <option value="">Select…</option>
                {props.specialties.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </Field>
            <div>
              <p className="label">Languages</p>
              <ul className="flex flex-wrap gap-3 text-sm">
                {props.languages.map((l) => (
                  <li key={l.id} className="flex items-center gap-1.5">
                    <input id={`lg-${l.id}`} type="checkbox" name="languageIds" value={l.id} defaultChecked={langs.has(l.id)} />
                    <label htmlFor={`lg-${l.id}`}>{l.label}{l.hint ? <span className="text-muted"> ({l.hint})</span> : null}</label>
                  </li>
                ))}
              </ul>
            </div>
            <Field label="About" htmlFor="about" hint="Who you treat, how you work, what patients can expect. No scripts, no outcome guarantees.">
              <textarea id="about" name="about" className="input" rows={8} minLength={100} maxLength={3000} defaultValue={props.draft.about ?? ""} />
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" className="btn btn-primary">Save and continue</button>
          </div>
        </Section>
      </form>
    </>
  );
}

export function ConsentStep({ versions, done }: { versions: { providerTerms: string; privacyNotice: string }; done: boolean }) {
  return (
    <form action={saveConsent}>
      <Section title="Publication consent and provider terms" lede="Both are recorded with the policy version you accepted (PRO-03). You can withdraw publication consent later from settings.">
        {done ? <p className="mb-4 text-sm"><StatePill state="accepted" /> Already recorded. Submitting again records a fresh acceptance of the current versions.</p> : null}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="publication" className="mt-1" required />
          <span>I consent to the publication of my professional profile — name, designation, qualifications, registrations, clinics, services and fees — on The Physio Index. Privacy notice version <code>{versions.privacyNotice}</code>. <Link href="/policies/privacy" className="underline">Read it</Link>.</span>
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" name="terms" className="mt-1" required />
          <span>I accept the provider terms, version <code>{versions.providerTerms}</code>, including that verification labels describe the check performed, not treatment quality, and that fees shown are genuine. <Link href="/policies/provider-terms" className="underline">Read them</Link>.</span>
        </label>
        <div className="mt-5"><button type="submit" className="btn btn-primary">Record consent and continue</button></div>
      </Section>
    </form>
  );
}

export function ReviewStep({ status, gaps, listingStatus }: { status: OnboardingStatus; gaps: string[]; listingStatus: string }) {
  const submitted = status.versionState === "submitted" || listingStatus === "submitted";
  return (
    <Section title="Review and submit" lede="Drafts, submissions and rejections never appear in public search. Approval creates the first published version (PRO-03).">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <Item label="Identity" ok={status.completed.identity} href="identity" />
        <Item label="Qualifications and credentials" ok={status.completed.credentials} href="credentials" />
        <Item label="Clinic location" ok={status.completed.practice} href="practice" />
        <Item label="Services and fees, expertise, about" ok={status.completed.services && Boolean(status.draft.specialties?.length) && (status.draft.about?.length ?? 0) >= 100} href="services" />
        <Item label="Consent and terms" ok={status.completed.consent} href="consent" />
      </dl>
      {gaps.length ? (
        <div className="mt-4 rounded-[var(--r-sm)] border border-mark bg-mark-soft p-3 text-sm">
          <p className="font-medium">Still needed before you can submit</p>
          <ul className="mt-1 list-disc pl-5">{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      ) : null}
      {submitted ? (
        <p className="mt-4 text-sm"><StatePill state="submitted" /> Your profile is under review. We aim to respond within two business days. <Link href="/workspace" className="underline">Go to your workspace</Link>.</p>
      ) : (
        <form action={submitListing} className="mt-5 flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary" disabled={gaps.length > 0} aria-disabled={gaps.length > 0}>Submit for review</button>
          <Link href="/workspace" className="btn btn-quiet">Save and finish later</Link>
        </form>
      )}
    </Section>
  );
}

function Item({ label, ok, href }: { label: string; ok: boolean; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--r-sm)] border border-line p-3">
      <dt>{label}</dt>
      <dd className="flex items-center gap-2">
        <StatePill state={ok ? "completed" : "pending"} />
        <Link href={`/workspace/onboarding?step=${href}`} className="underline">Edit</Link>
      </dd>
    </div>
  );
}
