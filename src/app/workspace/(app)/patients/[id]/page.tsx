import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Notice, PageHeader, Section } from "@/components/workspace/forms/ui";
import { PatientFields } from "@/components/workspace/patient-fields";
import { VisitFields } from "@/components/workspace/visit-fields";
import { ApiError } from "@/lib/api";
import { whatsappChatUrl } from "@/lib/practice/enquiries";
import { istToday } from "@/lib/practice/exercise-plans";
import { getPatient, listVisits, patientTimeline, recordsTermsAccepted, requirePatientAccess, VISIT_KINDS, type PatientAccess } from "@/lib/practice/patients";
import { formatIst } from "@/lib/workspace/calendar";
import { readMessage } from "@/lib/workspace/forms";
import { addVisitAction, archivePatientAction, updatePatientAction, updateVisitAction } from "../actions";

export const metadata: Metadata = { title: "Patient record", robots: { index: false, follow: false } };

export default function Page({ params, searchParams }: PageProps<"/workspace/patients/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <PatientPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const KIND = Object.fromEntries(VISIT_KINDS.map((k) => [k.key, k.label]));
const fmt = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const ICON: Record<string, string> = { visit: "●", plan: "◆", package: "■", payment: "₹", session: "✓", document: "▤" };

/** EMR-02..05: record, notes, timeline, links to plans and packages. Every open is logged (EMR-06). */
async function PatientPage({ params, searchParams }: { params: PageProps<"/workspace/patients/[id]">["params"]; searchParams: PageProps<"/workspace/patients/[id]">["searchParams"] }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  let access: PatientAccess;
  try {
    access = await requirePatientAccess("read");
  } catch (err) {
    if (err instanceof ApiError) notFound();
    throw err;
  }
  const { practitioner: p, viewer } = access;
  if (!(await recordsTermsAccepted(p.id))) notFound();
  const patient = await getPatient(p.id, viewer.userId, id);
  if (!patient) notFound();
  const [visits, timeline] = await Promise.all([listVisits(p.id, viewer.userId, id), patientTimeline(p.id, id)]);
  const msg = readMessage(sp);
  const today = istToday();
  const first = patient.fullName.split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={patient.fullName}
        lede={[patient.refNo, patient.age ? `${patient.age} years` : null, patient.sex, patient.mobile, patient.referredBy ? `referred by ${patient.referredBy}` : null, patient.archived ? "archived" : null].filter(Boolean).join(" · ")}
        action={<Link href="/workspace/patients" className="btn btn-quiet py-2 text-sm">All patients</Link>}
      />
      <Notice ok={msg.ok} error={msg.error} />

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {patient.mobile ? <a href={`tel:${patient.mobile}`} className="btn btn-secondary py-1.5 text-sm">Call</a> : null}
        {patient.mobile ? <a href={whatsappChatUrl(patient.mobile, `Hello ${first}, this is ${p.displayName}.`)} target="_blank" rel="noopener noreferrer" className="btn btn-secondary py-1.5 text-sm">WhatsApp</a> : null}
        {access.canWrite ? <Link href={`/workspace/exercises/new?patient=${patient.id}`} className="btn btn-secondary py-1.5 text-sm">New exercise plan</Link> : null}
        {access.canWrite ? <Link href={`/workspace/packages?patient=${patient.id}#sell`} className="btn btn-secondary py-1.5 text-sm">Sell package</Link> : null}
      </div>

      {patient.medicalHistory ? (
        <div className="card mt-4 border-mark bg-mark-soft p-4 text-sm"><p className="font-semibold">Medical history</p><p className="mt-1 whitespace-pre-line">{patient.medicalHistory}</p></div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          {access.canWrite && !patient.archived ? (
            <form action={addVisitAction}>
              <input type="hidden" name="patientId" value={patient.id} />
              <Section title="New note" lede="Notes can be edited by their author for 24 hours. After that, add an addendum.">
                <details open={visits.length === 0}>
                  <summary className="cursor-pointer text-sm font-medium underline">Write a consultation note</summary>
                  <div className="mt-4">
                    <VisitFields today={today} idPrefix="new" />
                    <div className="mt-4"><button type="submit" className="btn btn-primary">Save note</button></div>
                  </div>
                </details>
              </Section>
            </form>
          ) : null}

          <Section title="Consultation notes">
            {visits.length === 0 ? <Empty>No notes yet.</Empty> : (
              <ol className="grid gap-4">
                {visits.map((v) => (
                  <li key={v.id} id={`visit-${v.id}`} className="scroll-mt-6 rounded-[var(--r-sm)] border border-line p-4 text-sm">
                    <p className="font-semibold">{fmt(v.visitOn)} · {KIND[v.kind]}{v.painScore !== null ? ` · pain ${v.painScore}/10` : ""}</p>
                    <p className="text-xs text-muted">by {v.authorName ?? "—"} · written {formatIst(v.createdAt)}</p>
                    <dl className="mt-2 grid gap-1">
                      {([["Complaint", v.chiefComplaint], ["History", v.history], ["Findings", v.findings], ["Impression", v.diagnosis], ["Treatment", v.treatmentGiven], ["Plan", v.plan]] as const)
                        .filter(([, t]) => t)
                        .map(([label, t]) => <div key={label}><dt className="inline font-medium">{label}: </dt><dd className="inline whitespace-pre-line">{t}</dd></div>)}
                      {v.nextVisitOn ? <div><dt className="inline font-medium">Next visit: </dt><dd className="inline">{fmt(v.nextVisitOn)}</dd></div> : null}
                    </dl>
                    {v.editable && access.canWrite ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm underline">Edit (open for 24 hours)</summary>
                        <form action={updateVisitAction} className="mt-3">
                          <input type="hidden" name="patientId" value={patient.id} />
                          <input type="hidden" name="visitId" value={v.id} />
                          <VisitFields v={v} today={today} idPrefix={`v-${v.id}`} />
                          <div className="mt-3"><button type="submit" className="btn btn-secondary py-1.5 text-sm">Save changes</button></div>
                        </form>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <aside>
          <Section title="Timeline">
            {timeline.length === 0 ? <Empty>Nothing yet.</Empty> : (
              <ol className="relative grid gap-3 border-l border-line pl-4 text-sm">
                {timeline.map((t, i) => (
                  <li key={`${t.at}-${t.kind}-${i}`}>
                    <span className="absolute -left-[0.4rem] mt-0.5 text-xs text-brand" aria-hidden>{ICON[t.kind] ?? "•"}</span>
                    <p className="text-xs text-muted">{fmt(t.at)}</p>
                    <p className="font-medium">{t.href ? <Link href={t.href.startsWith("#") ? t.href : t.href} className="underline-offset-2 hover:underline">{t.title}</Link> : t.title}</p>
                    {t.detail ? <p className="text-muted">{t.detail}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </aside>
      </div>

      {access.canWrite ? (
        <form action={updatePatientAction}>
          <input type="hidden" name="patientId" value={patient.id} />
          <Section title="Patient details" lede={`Consent recorded ${formatIst(patient.consentRecordedAt, { day: "numeric", month: "short", year: "numeric" })}.`}>
            <PatientFields p={patient} />
            <div className="mt-4"><button type="submit" className="btn btn-secondary">Save details</button></div>
          </Section>
        </form>
      ) : null}

      {access.canWrite ? (
        <form action={archivePatientAction} className="mt-8 border-t border-line pt-4">
          <input type="hidden" name="patientId" value={patient.id} />
          <input type="hidden" name="archived" value={patient.archived ? "0" : "1"} />
          <button type="submit" className="btn btn-quiet py-1 text-sm">{patient.archived ? "Restore patient" : "Archive patient"}</button>
          <p className="mt-1 text-xs text-muted">Archiving hides the patient from your list; the record is kept. For a patient&rsquo;s request to erase their record, contact support.</p>
        </form>
      ) : null}
    </div>
  );
}
