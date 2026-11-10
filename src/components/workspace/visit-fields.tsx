import { Field } from "@/components/workspace/forms/ui";
import { VISIT_KINDS, type VisitRow } from "@/lib/practice/patients";

/** EMR-03 consultation note fields (assessment → findings → diagnosis → treatment → plan). */
export function VisitFields({ v, today, idPrefix }: { v?: VisitRow; today: string; idPrefix: string }) {
  const id = (n: string) => `${idPrefix}-${n}`;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Date" htmlFor={id("visitOn")}><input id={id("visitOn")} name="visitOn" type="date" className="input" required max={today} defaultValue={v?.visitOn ?? today} /></Field>
      <Field label="Type" htmlFor={id("kind")}>
        <select id={id("kind")} name="kind" className="input" defaultValue={v?.kind ?? "follow_up"}>
          {VISIT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </Field>
      <Field label="Pain (0–10)" htmlFor={id("painScore")}><input id={id("painScore")} name="painScore" type="number" min={0} max={10} className="input" defaultValue={v?.painScore ?? undefined} /></Field>
      <div className="sm:col-span-3"><Field label="Chief complaint" htmlFor={id("chiefComplaint")}><input id={id("chiefComplaint")} name="chiefComplaint" className="input" maxLength={1000} defaultValue={v?.chiefComplaint ?? undefined} placeholder="e.g. Right knee pain on stairs, 3 weeks" /></Field></div>
      <div className="sm:col-span-3"><Field label="History" htmlFor={id("history")}><textarea id={id("history")} name="history" className="input" rows={2} maxLength={4000} defaultValue={v?.history ?? undefined} placeholder="Onset, aggravating / easing factors, previous treatment" /></Field></div>
      <div className="sm:col-span-3"><Field label="Findings" htmlFor={id("findings")}><textarea id={id("findings")} name="findings" className="input" rows={3} maxLength={4000} defaultValue={v?.findings ?? undefined} placeholder="Observation, ROM, strength (MMT), special tests, outcome measures" /></Field></div>
      <div className="sm:col-span-3"><Field label="Clinical impression / diagnosis" htmlFor={id("diagnosis")}><input id={id("diagnosis")} name="diagnosis" className="input" maxLength={1000} defaultValue={v?.diagnosis ?? undefined} /></Field></div>
      <div className="sm:col-span-3"><Field label="Treatment given" htmlFor={id("treatmentGiven")}><textarea id={id("treatmentGiven")} name="treatmentGiven" className="input" rows={2} maxLength={3000} defaultValue={v?.treatmentGiven ?? undefined} placeholder="Manual therapy, electrotherapy, exercise, taping, education" /></Field></div>
      <div className="sm:col-span-2"><Field label="Plan" htmlFor={id("plan")}><textarea id={id("plan")} name="plan" className="input" rows={2} maxLength={3000} defaultValue={v?.plan ?? undefined} placeholder="Goals, frequency, home advice" /></Field></div>
      <Field label="Next visit (optional)" htmlFor={id("nextVisitOn")}><input id={id("nextVisitOn")} name="nextVisitOn" type="date" className="input" defaultValue={v?.nextVisitOn ?? undefined} /></Field>
    </div>
  );
}
