import type { AuthorityOption, OfferingDefaults, Option } from "@/lib/workspace/catalog";
import { paiseToRupeesInput } from "@/lib/workspace/forms";
import type { OfferingRow } from "@/lib/workspace/queries";
import { Field, Select } from "./ui";

/** Offering fields (CAL-02, CAL-03). Values default from platform_config; bounds are shown and enforced server-side. */
export function OfferingFields({ services, defaults, value, idPrefix = "" }: { services: Option[]; defaults: OfferingDefaults; value?: OfferingRow; idPrefix?: string }) {
  const b = defaults.bounds;
  const id = (n: string) => `${idPrefix}${n}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Service" htmlFor={id("serviceId")}>
        {value ? (
          <>
            <input type="hidden" name="serviceId" value={value.serviceId} />
            <p className="input bg-surface-2">{value.serviceLabel}</p>
          </>
        ) : (
          <Select id={id("serviceId")} name="serviceId" options={services} required />
        )}
      </Field>
      <Field label="Display name" htmlFor={id("displayName")} hint="What patients see, e.g. “Initial assessment (45 min)”.">
        <input id={id("displayName")} name="displayName" className="input" required minLength={2} maxLength={120} defaultValue={value?.displayName ?? ""} />
      </Field>
      <Field label="Fee (₹)" htmlFor={id("feeRupees")} hint="Pay at clinic. Stored exactly as paise; no rounding.">
        <input id={id("feeRupees")} name="feeRupees" className="input" inputMode="decimal" required defaultValue={value ? paiseToRupeesInput(value.basePricePaise) : ""} placeholder="e.g. 600" />
      </Field>
      <Field label="Price note" htmlFor={id("priceNote")} hint="Initial assessment or follow-up, what is included (OFR-01).">
        <input id={id("priceNote")} name="priceNote" className="input" maxLength={200} defaultValue={value?.priceNote ?? ""} />
      </Field>
      <Field label="Taxes (₹, optional)" htmlFor={id("taxRupees")}>
        <input id={id("taxRupees")} name="taxRupees" className="input" inputMode="decimal" defaultValue={value && value.taxPaise ? paiseToRupeesInput(value.taxPaise) : ""} />
      </Field>
      <Field label="Extra charges (₹, optional)" htmlFor={id("extraRupees")} hint="Must be disclosed up front; no hidden charges.">
        <input id={id("extraRupees")} name="extraRupees" className="input" inputMode="decimal" defaultValue={value && value.extraChargesPaise ? paiseToRupeesInput(value.extraChargesPaise) : ""} />
      </Field>
      <Field label={`Duration (min, ${b.durationMin[0]}–${b.durationMin[1]})`} htmlFor={id("durationMin")}>
        <input id={id("durationMin")} name="durationMin" type="number" className="input" min={b.durationMin[0]} max={b.durationMin[1]} defaultValue={value?.durationMin ?? defaults.durationMin} />
      </Field>
      <Field label={`Slot start interval (min, ${b.intervalMin[0]}–${b.intervalMin[1]})`} htmlFor={id("intervalMin")}>
        <input id={id("intervalMin")} name="intervalMin" type="number" className="input" min={b.intervalMin[0]} max={b.intervalMin[1]} defaultValue={value?.intervalMin ?? defaults.intervalMin} />
      </Field>
      <Field label={`Buffer before (min, ${b.bufferMin[0]}–${b.bufferMin[1]})`} htmlFor={id("bufferBeforeMin")}>
        <input id={id("bufferBeforeMin")} name="bufferBeforeMin" type="number" className="input" min={b.bufferMin[0]} max={b.bufferMin[1]} defaultValue={value?.bufferBeforeMin ?? defaults.bufferBeforeMin} />
      </Field>
      <Field label={`Buffer after (min, ${b.bufferMin[0]}–${b.bufferMin[1]})`} htmlFor={id("bufferAfterMin")} hint="Affects availability, not the patient-facing appointment length (CAL-08).">
        <input id={id("bufferAfterMin")} name="bufferAfterMin" type="number" className="input" min={b.bufferMin[0]} max={b.bufferMin[1]} defaultValue={value?.bufferAfterMin ?? defaults.bufferAfterMin} />
      </Field>
      <Field label={`Minimum notice (min, ${b.minNoticeMin[0]}–${b.minNoticeMin[1]})`} htmlFor={id("minNoticeMin")}>
        <input id={id("minNoticeMin")} name="minNoticeMin" type="number" className="input" min={b.minNoticeMin[0]} max={b.minNoticeMin[1]} defaultValue={value?.minNoticeMin ?? defaults.minNoticeMin} />
      </Field>
      <Field label={`Booking horizon (days, ${b.horizonDays[0]}–${b.horizonDays[1]})`} htmlFor={id("bookingHorizonDays")}>
        <input id={id("bookingHorizonDays")} name="bookingHorizonDays" type="number" className="input" min={b.horizonDays[0]} max={b.horizonDays[1]} defaultValue={value?.bookingHorizonDays ?? defaults.horizonDays} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Description (optional)" htmlFor={id("description")}>
          <textarea id={id("description")} name="description" className="input" rows={2} maxLength={400} defaultValue={value?.description ?? ""} />
        </Field>
      </div>
    </div>
  );
}

/**
 * New clinic + branch fields (LOC-01). Location selects cascade through
 * server round-trips (GET) so the form works without JavaScript.
 */
export function ClinicFields({ states, cities, localities, selected, reloadAction }: { states: Option[]; cities: Option[]; localities: Option[]; selected: { stateId?: string; cityId?: string }; reloadAction: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Clinic name" htmlFor="clinicName">
        <input id="clinicName" name="clinicName" className="input" required minLength={2} maxLength={160} />
      </Field>
      <Field label="Branch name (optional)" htmlFor="branchName" hint="Leave blank if the clinic has one location.">
        <input id="branchName" name="branchName" className="input" maxLength={120} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Address line 1" htmlFor="addressLine1">
          <input id="addressLine1" name="addressLine1" className="input" required minLength={3} maxLength={200} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Address line 2 (optional)" htmlFor="addressLine2">
          <input id="addressLine2" name="addressLine2" className="input" maxLength={200} />
        </Field>
      </div>
      <Field label="State" htmlFor="stateId">
        <Select id="stateId" name="stateId" options={states} value={selected.stateId} required />
      </Field>
      <Field label="City" htmlFor="cityId" hint={!selected.stateId ? "Choose a state, then load cities." : undefined}>
        <Select id="cityId" name="cityId" options={cities} value={selected.cityId} placeholder={selected.stateId ? "Select…" : "Load cities first"} required />
      </Field>
      <Field label="Locality" htmlFor="localityId" hint="Not listed? Choose “Propose a new locality” and type its name; it goes to review (DIR-08).">
        <select id="localityId" name="localityId" className="input" defaultValue="">
          <option value="">{selected.cityId ? "Select…" : "Load localities first"}</option>
          {localities.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
          <option value="__new">Propose a new locality…</option>
        </select>
      </Field>
      <Field label="New locality name (if proposing)" htmlFor="newLocalityName">
        <input id="newLocalityName" name="newLocalityName" className="input" maxLength={120} />
      </Field>
      <Field label="PIN code" htmlFor="pinCode" hint="Six digits. A PIN code does not identify a locality on its own.">
        <input id="pinCode" name="pinCode" className="input" inputMode="numeric" pattern="[1-9][0-9]{5}" required maxLength={6} />
      </Field>
      <Field label="Clinic phone (public)" htmlFor="phone">
        <input id="phone" name="phone" className="input" inputMode="tel" maxLength={20} />
      </Field>
      <div className="flex flex-wrap items-center gap-2 text-sm sm:col-span-2">
        <button type="submit" formAction={reloadAction} formMethod="get" formNoValidate className="btn btn-quiet py-1.5 text-sm">Load cities and localities for the selected state/city</button>
        <span className="text-muted">Other fields will need re-entering after reloading.</span>
      </div>
    </div>
  );
}

export function CredentialFields({ authorities }: { authorities: AuthorityOption[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Issuing authority" htmlFor="authorityId" hint="Registration, enrolment, degree and association membership are different things; none substitutes for another (VER-01).">
          <select id="authorityId" name="authorityId" className="input" required defaultValue="">
            <option value="">Select…</option>
            {authorities.map((a) => (
              <option key={a.id} value={a.id}>{a.label}{a.jurisdiction ? ` — ${a.jurisdiction}` : ""} · {a.kind.replace(/_/g, " ")}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Number as printed" htmlFor="number">
        <input id="number" name="number" className="input" required minLength={2} maxLength={60} />
      </Field>
      <Field label="Type (optional override)" htmlFor="type">
        <select id="type" name="type" className="input" defaultValue="">
          <option value="">Use the authority’s default</option>
          <option value="statutory_registration">Statutory registration</option>
          <option value="enrolment">Enrolment identifier</option>
          <option value="degree">Degree</option>
          <option value="association_membership">Association membership</option>
          <option value="certification">Certification</option>
        </select>
      </Field>
      <Field label="Issue date (optional)" htmlFor="issueDate">
        <input id="issueDate" name="issueDate" type="date" className="input" />
      </Field>
      <Field label="Expiry (optional)" htmlFor="expiresOn" hint="Renewal reminders go out 30, 7 and 1 day before (VER-05).">
        <input id="expiresOn" name="expiresOn" type="date" className="input" />
      </Field>
    </div>
  );
}
