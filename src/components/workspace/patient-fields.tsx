import { Field } from "@/components/workspace/forms/ui";
import type { PatientRecord } from "@/lib/practice/patients";

/** EMR-02 form fields, shared by add and edit. */
export function PatientFields({ p }: { p?: PatientRecord }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" htmlFor="fullName"><input id="fullName" name="fullName" className="input" required minLength={2} maxLength={100} defaultValue={p?.fullName} /></Field>
      <Field label="Mobile (optional)" htmlFor="mobile"><input id="mobile" name="mobile" className="input" inputMode="tel" maxLength={16} defaultValue={p?.mobile ?? undefined} placeholder="98xxxxxxxx" /></Field>
      <Field label="Sex (optional)" htmlFor="sex">
        <select id="sex" name="sex" className="input" defaultValue={p?.sex ?? ""}>
          <option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option>
        </select>
      </Field>
      <Field label="Year of birth (optional)" htmlFor="birthYear"><input id="birthYear" name="birthYear" type="number" min={1900} max={new Date().getFullYear()} className="input" defaultValue={p?.birthYear ?? undefined} /></Field>
      <Field label="Referred by (optional)" htmlFor="referredBy"><input id="referredBy" name="referredBy" className="input" maxLength={120} defaultValue={p?.referredBy ?? undefined} placeholder="e.g. Dr. Rao, orthopaedics" /></Field>
      <Field label="Emergency contact (optional)" htmlFor="emergencyContact"><input id="emergencyContact" name="emergencyContact" className="input" maxLength={200} defaultValue={p?.emergencyContact ?? undefined} /></Field>
      <div className="sm:col-span-2"><Field label="Address (optional)" htmlFor="address"><input id="address" name="address" className="input" maxLength={300} defaultValue={p?.address ?? undefined} /></Field></div>
      <div className="sm:col-span-2">
        <Field label="Medical history (optional)" htmlFor="medicalHistory" hint="Conditions, medicines, allergies, surgeries, red flags.">
          <textarea id="medicalHistory" name="medicalHistory" className="input" rows={3} maxLength={3000} defaultValue={p?.medicalHistory ?? undefined} />
        </Field>
      </div>
      <div className="sm:col-span-2"><Field label="Other notes (optional)" htmlFor="notes"><textarea id="notes" name="notes" className="input" rows={2} maxLength={2000} defaultValue={p?.notes ?? undefined} /></Field></div>
    </div>
  );
}
