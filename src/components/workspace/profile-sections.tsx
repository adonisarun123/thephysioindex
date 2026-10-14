import type { AuthorityOption, Option } from "@/lib/workspace/catalog";
import type { ProfileDraft } from "@/lib/workspace/draft";
import type { CredentialRow } from "@/lib/workspace/queries";
import { CredentialFields } from "@/components/workspace/forms/fields";
import { Empty, Field, Section, StatePill } from "@/components/workspace/forms/ui";
import {
  addCredentialAction,
  removeCredentialAction,
  saveAboutSection,
  saveExperiencesSection,
  saveExpertiseSection,
  saveIdentitySection,
  savePortfolioSection,
  saveQualificationsSection,
} from "@/app/workspace/(app)/profile/actions";

/** Section-based draft editor (PRO-08). Each section is its own form posting to one server action. */

const YEAR = new Date().getFullYear();

function Save({ label = "Save section" }: { label?: string }) {
  return <div className="mt-4"><button type="submit" className="btn btn-secondary py-2 text-sm">{label}</button></div>;
}

export function IdentitySection({ identity }: { identity: ProfileDraft["identity"] | undefined }) {
  return (
    <form action={saveIdentitySection}>
      <Section id="identity" title="Identity" lede="Name 2–120 characters; headline up to 160. Name and designation changes on a published profile are re-reviewed (VER-05).">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Display name" htmlFor="displayName"><input id="displayName" name="displayName" className="input" required minLength={2} maxLength={120} defaultValue={identity?.displayName ?? ""} /></Field>
          </div>
          <Field label="Designation" htmlFor="designation"><input id="designation" name="designation" className="input" maxLength={80} defaultValue={identity?.designation ?? ""} /></Field>
          <Field label="Gender (optional)" htmlFor="gender">
            <select id="gender" name="gender" className="input" defaultValue={identity?.gender ?? "unset"}>
              <option value="unset">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="non_binary">Non-binary</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Headline" htmlFor="headline"><input id="headline" name="headline" className="input" maxLength={160} defaultValue={identity?.headline ?? ""} /></Field>
          </div>
        </div>
        <Save />
      </Section>
    </form>
  );
}

export function AboutSection({ about }: { about: string | undefined }) {
  return (
    <form action={saveAboutSection}>
      <Section id="about" title="About" lede="100–3000 characters of plain text. Tags are stripped; no scripts or outcome guarantees (PRO-08, PRO-10).">
        <textarea id="about-text" name="about" className="input" rows={10} minLength={100} maxLength={3000} defaultValue={about ?? ""} aria-label="About" />
        <p className="mt-1 text-xs text-muted">{about?.length ?? 0} / 3000 characters saved.</p>
        <Save />
      </Section>
    </form>
  );
}

export function QualificationsSection({ items }: { items: NonNullable<ProfileDraft["qualifications"]> }) {
  const rows = [...items, ...Array.from({ length: Math.max(1, 4 - items.length) }, () => null)];
  return (
    <form action={saveQualificationsSection}>
      <Section id="qualifications" title="Qualifications" lede="Degree, institution and year. Years cannot be in the future unless the qualification is in progress.">
        <div className="grid gap-3">
          {rows.map((q, i) => (
            <fieldset key={i} className="grid gap-2 rounded-[var(--r-sm)] border border-line p-3 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-end">
              <legend className="sr-only">Qualification {i + 1}</legend>
              <Field label="Degree" htmlFor={`q-${i}-degree`}><input id={`q-${i}-degree`} name={`q[${i}].degree`} className="input" maxLength={120} defaultValue={q?.degree ?? ""} /></Field>
              <Field label="Institution" htmlFor={`q-${i}-inst`}><input id={`q-${i}-inst`} name={`q[${i}].institution`} className="input" maxLength={160} defaultValue={q?.institution ?? ""} /></Field>
              <Field label="Year" htmlFor={`q-${i}-year`}><input id={`q-${i}-year`} name={`q[${i}].completionYear`} type="number" className="input" min={1950} max={YEAR + 6} defaultValue={q?.completionYear ?? ""} /></Field>
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name={`q[${i}].inProgress`} defaultChecked={q?.inProgress ?? false} /> In progress</label>
            </fieldset>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Blank rows are ignored; clear a row to remove it.</p>
        <Save />
      </Section>
    </form>
  );
}

export function ExperienceSection({ items }: { items: NonNullable<ProfileDraft["experiences"]> }) {
  const rows = [...items, ...Array.from({ length: Math.max(1, 3 - items.length) }, () => null)];
  return (
    <form action={saveExperiencesSection}>
      <Section id="experience" title="Experience" lede="Role, organisation, start month and optional end month. Dates must be ordered; overlapping roles are allowed and are never added together (PRO-11).">
        <div className="grid gap-3">
          {rows.map((e, i) => (
            <fieldset key={i} className="grid gap-2 rounded-[var(--r-sm)] border border-line p-3 sm:grid-cols-2">
              <legend className="sr-only">Role {i + 1}</legend>
              <Field label="Role" htmlFor={`e-${i}-role`}><input id={`e-${i}-role`} name={`e[${i}].role`} className="input" maxLength={120} defaultValue={e?.role ?? ""} /></Field>
              <Field label="Organisation" htmlFor={`e-${i}-org`}><input id={`e-${i}-org`} name={`e[${i}].organisationName`} className="input" maxLength={160} defaultValue={e?.organisationName ?? ""} /></Field>
              <Field label="Start month" htmlFor={`e-${i}-start`}><input id={`e-${i}-start`} name={`e[${i}].startMonth`} type="month" className="input" defaultValue={e?.startMonth ?? ""} /></Field>
              <Field label="End month (blank = current)" htmlFor={`e-${i}-end`}><input id={`e-${i}-end`} name={`e[${i}].endMonth`} type="month" className="input" defaultValue={e?.endMonth ?? ""} /></Field>
              <div className="sm:col-span-2">
                <Field label="Description (optional)" htmlFor={`e-${i}-desc`}><input id={`e-${i}-desc`} name={`e[${i}].description`} className="input" maxLength={600} defaultValue={e?.description ?? ""} /></Field>
              </div>
            </fieldset>
          ))}
        </div>
        <Save />
      </Section>
    </form>
  );
}

export function ExpertiseSection({ draft, specialties, languages }: { draft: ProfileDraft; specialties: Option[]; languages: Option[] }) {
  const chosen = new Set((draft.specialties ?? []).map((s) => s.specialtyId));
  const primary = draft.specialties?.find((s) => s.isPrimary)?.specialtyId ?? "";
  const langs = new Set(draft.languages ?? []);
  return (
    <form action={saveExpertiseSection}>
      <Section id="expertise" title="Areas of practice and languages" lede="Controlled taxonomy; one primary area. Advanced areas may need supporting evidence at review (PRO-08).">
        <ul className="grid gap-2 sm:grid-cols-2">
          {specialties.map((s) => (
            <li key={s.id} className="flex items-start gap-2 text-sm">
              <input id={`sp-${s.id}`} type="checkbox" name="specialtyIds" value={s.id} defaultChecked={chosen.has(s.id)} className="mt-1" />
              <label htmlFor={`sp-${s.id}`}>{s.label}</label>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Primary area" htmlFor="primarySpecialtyId">
            <select id="primarySpecialtyId" name="primarySpecialtyId" className="input" defaultValue={primary} required>
              <option value="">Select…</option>
              {specialties.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <div>
            <p className="label">Languages</p>
            <ul className="flex flex-wrap gap-3 text-sm">
              {languages.map((l) => (
                <li key={l.id} className="flex items-center gap-1.5">
                  <input id={`lg-${l.id}`} type="checkbox" name="languageIds" value={l.id} defaultChecked={langs.has(l.id)} />
                  <label htmlFor={`lg-${l.id}`}>{l.label}</label>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Save />
      </Section>
    </form>
  );
}

const KINDS = [["award", "Award"], ["certification", "Certification"], ["membership", "Membership"], ["publication", "Publication"], ["website", "Website"], ["social", "Social profile"]] as const;

export function PortfolioSection({ items }: { items: NonNullable<ProfileDraft["portfolio"]> }) {
  const rows = [...items, ...Array.from({ length: Math.max(1, 3 - items.length) }, () => null)];
  return (
    <form action={savePortfolioSection}>
      <Section id="portfolio" title="Achievements, memberships and links" lede="Optional. Issuer and date where applicable; links are validated. No patient-identifiable media (PRO-08).">
        <div className="grid gap-3">
          {rows.map((p, i) => (
            <fieldset key={i} className="grid gap-2 rounded-[var(--r-sm)] border border-line p-3 sm:grid-cols-3">
              <legend className="sr-only">Item {i + 1}</legend>
              <Field label="Type" htmlFor={`p-${i}-kind`}>
                <select id={`p-${i}-kind`} name={`p[${i}].kind`} className="input" defaultValue={p?.kind ?? "certification"}>
                  {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Title" htmlFor={`p-${i}-title`}><input id={`p-${i}-title`} name={`p[${i}].title`} className="input" maxLength={160} defaultValue={p?.title ?? ""} /></Field>
              </div>
              <Field label="Issuer" htmlFor={`p-${i}-issuer`}><input id={`p-${i}-issuer`} name={`p[${i}].issuer`} className="input" maxLength={160} defaultValue={p?.issuer ?? ""} /></Field>
              <Field label="Date" htmlFor={`p-${i}-date`}><input id={`p-${i}-date`} name={`p[${i}].itemDate`} type="date" className="input" defaultValue={p?.itemDate ?? ""} /></Field>
              <Field label="Link" htmlFor={`p-${i}-url`}><input id={`p-${i}-url`} name={`p[${i}].url`} type="url" className="input" maxLength={300} defaultValue={p?.url ?? ""} /></Field>
              <div className="sm:col-span-3">
                <Field label="Description" htmlFor={`p-${i}-desc`}><input id={`p-${i}-desc`} name={`p[${i}].description`} className="input" maxLength={400} defaultValue={p?.description ?? ""} /></Field>
              </div>
            </fieldset>
          ))}
        </div>
        <Save />
      </Section>
    </form>
  );
}

export function CredentialsSection({ credentials, authorities }: { credentials: CredentialRow[]; authorities: AuthorityOption[] }) {
  return (
    <Section id="credentials" title="Registrations, enrolments and memberships" lede="Status is read-only here: a reviewer sets it after checking (VER-01, VER-02). Numbers are kept as text; the public number shows only once approved.">
      {credentials.length === 0 ? (
        <Empty>No credentials yet. At least one registration or enrolment is required for a bookable profile.</Empty>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {credentials.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium">{c.authorityName}</p>
                <p className="text-muted">{c.type.replace(/_/g, " ")} · No. {c.numberOriginal}{c.issueDate ? ` · issued ${c.issueDate}` : ""}{c.expiresOn ? ` · expires ${c.expiresOn}` : ""}{c.lastCheckedAt ? ` · checked ${c.lastCheckedAt.slice(0, 10)}` : ""}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatePill state={c.status} />
                {["self_declared", "pending"].includes(c.status) ? (
                  <form action={removeCredentialAction}>
                    <input type="hidden" name="credentialId" value={c.id} />
                    <button type="submit" className="underline">Remove</button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-brand-ink">Add a credential</summary>
        <form action={addCredentialAction} className="mt-3">
          <CredentialFields authorities={authorities} />
          <Save label="Add credential" />
        </form>
      </details>
    </Section>
  );
}
