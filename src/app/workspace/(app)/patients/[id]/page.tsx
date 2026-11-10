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
import { addVisitAction, archivePatientAction, deleteDocumentAction, updatePatientAction, updateVisitAction, uploadDocumentAction } from "../actions";
import { DOCUMENT_CATEGORIES, documentsEnabled, listDocuments } from "@/lib/practice/documents";
import { Field } from "@/components/workspace/forms/ui";

export const metadata: Metadata = { title: "Patient record", robots: { index: false, follow: false } };

export default function Page({ params, searchParams }: PageProps<"/workspace/patients/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <PatientPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const KIND = Object.fromEntries(VISIT_KINDS.map((k) => [k.key, k.label]));
const CATEGORY: Record<string, string> = Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c.key, c.label]));
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
  const [visits, timeline, documents] = await Promise.all([listVisits(p.id, viewer.userId, id), patientTimeline(p.id, id), listDocuments(p.id, id)]);
  const storageOn = documentsEnabled();
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
          <Section title="Documents">
            {documents.length === 0 ? <Empty>No documents yet.</Empty> : (
              <ul className="grid gap-2 text-sm">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <a href={`/api/v1/patient-documents?id=${d.id}`} target="_blank" rel="noopener noreferrer" className="font-medium underline">{d.title}</a>
                      <p className="text-xs text-muted">{CATEGORY[d.category]} · {d.docDate ? fmt(d.docDate) : formatIst(d.createdAt, { day: "numeric", month: "short", year: "numeric" })} · {Math.max(1, Math.round(d.bytes / 1024))} KB</p>
                    </div>
                    {access.canWrite ? (
                      <form action={deleteDocumentAction}>
                        <input type="hidden" name="patientId" value={patient.id} />
                        <input type="hidden" name="documentId" value={d.id} />
                        <button type="submit" className="text-xs underline" aria-label={`Delete ${d.title}`}>Delete</button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {access.canWrite && !patient.archived ? (
              storageOn ? (
                <form action={uploadDocumentAction} className="mt-4 grid gap-3 border-t border-line pt-4">
                  <input type="hidden" name="patientId" value={patient.id} />
                  <Field label="File (PDF, JPG, PNG; up to 4 MB)" htmlFor="file"><input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-sm" required /></Field>
                  <Field label="Title" htmlFor="docTitle"><input id="docTitle" name="title" className="input" maxLength={120} placeholder="e.g. MRI right knee" /></Field>
                  <Field label="Type" htmlFor="category">
                    <select id="category" name="category" className="input" defaultValue="report">
                      {DOCUMENT_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Document date (optional)" htmlFor="docDate"><input id="docDate" name="docDate" type="date" className="input" max={today} /></Field>
                  <div><button type="submit" className="btn btn-secondary py-1.5 text-sm">Upload</button></div>
                </form>
              ) : <p className="mt-3 text-xs text-muted">Document storage is being set up. Uploads will appear here soon.</p>
            ) : null}
          </Section>
          <Section title="Timeline">
            {timeline.length === 0 ? <Empty>Nothing yet.</Empty> : (
              <ol className="relative grid gap-3 border-l border-line pl-4 text-sm">
                {timeline.map((t, i) => (
                  <li key={`${t.at}-${t.kind}-${i}`}>
                    <span className="absolute -left-[0.4rem] mt-0.5 text-xs text-brand" aria-hidden>{ICON[t.kind] ?? "•"}</span>
                    <p className="text-xs text-muted">{fmt(t.at)}</p>
                    <p className="font-medium">{!t.href ? t.title : t.href.startsWith("/api/") ? <a href={t.href} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{t.title}</a> : <Link href={t.href} className="underline-offset-2 hover:underline">{t.title}</Link>}</p>
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
