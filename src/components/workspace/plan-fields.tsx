import { Field, Section } from "@/components/workspace/forms/ui";

/** Shared header fields for create and edit (HEP-02). Patient label is a first name or initials only. */
export function PlanFields({ values }: { values?: { patientLabel: string; title: string; advice: string | null; endsOn: string | null } }) {
  return (
    <Section title="Plan details" lede="Use the patient's first name or initials only. Do not enter phone numbers, diagnoses or other personal details here.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Patient (first name or initials)" htmlFor="patientLabel"><input id="patientLabel" name="patientLabel" className="input" required maxLength={40} defaultValue={values?.patientLabel} placeholder="e.g. Ravi K" /></Field>
        <Field label="Plan title" htmlFor="title"><input id="title" name="title" className="input" required minLength={3} maxLength={80} defaultValue={values?.title} placeholder="e.g. Knee strengthening — week 1" /></Field>
        <div className="sm:col-span-2">
          <Field label="General advice (optional)" htmlFor="advice" hint="Shown at the top of the plan, e.g. warm up first, ice after, when to stop and call you.">
            <textarea id="advice" name="advice" className="input" rows={3} maxLength={1500} defaultValue={values?.advice ?? undefined} />
          </Field>
        </div>
        <Field label="Plan ends on (optional)" htmlFor="endsOn" hint="After this date the patient sees that the plan has ended."><input id="endsOn" name="endsOn" type="date" className="input" defaultValue={values?.endsOn ?? undefined} /></Field>
      </div>
    </Section>
  );
}
