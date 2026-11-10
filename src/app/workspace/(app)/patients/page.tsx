import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Notice, PageHeader, Section } from "@/components/workspace/forms/ui";
import { PatientFields } from "@/components/workspace/patient-fields";
import { RecordsTerms } from "@/components/workspace/records-terms";
import { ApiError } from "@/lib/api";
import { listPatients, recordsTermsAccepted, requirePatientAccess, type PatientAccess } from "@/lib/practice/patients";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { acceptTermsAction, createPatientAction } from "./actions";

export const metadata: Metadata = { title: "Patients" };

export default function Page({ searchParams }: PageProps<"/workspace/patients">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Patients searchParams={searchParams} />
    </Suspense>
  );
}

const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }) : "—");

/** EMR-01..02: terms gate, patient register with search, add patient. */
async function Patients({ searchParams }: { searchParams: PageProps<"/workspace/patients">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace/patients");
  const msg = readMessage(sp);
  let access: PatientAccess;
  try {
    access = await requirePatientAccess("read");
  } catch (err) {
    if (err instanceof ApiError) return <Denied text="You don't have access to patient records for this practice. Ask the profile owner to give you the “View patient records” permission." />;
    throw err;
  }
  const accepted = await recordsTermsAccepted(p.id);
  if (!accepted) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Patient records" lede="Patient register, consultation notes, treatment timeline and documents — free for listed physiotherapists." />
        <Notice ok={msg.ok} error={msg.error} />
        <Section title="Before you start">
          <RecordsTerms />
          {p.isOwner ? (
            <form action={acceptTermsAction} className="mt-4 grid gap-3">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="accept" className="mt-1" required /> <span>I have read and accept these terms for my practice.</span></label>
              <div><button type="submit" className="btn btn-primary">Turn on patient records</button></div>
            </form>
          ) : <p className="mt-4 text-sm text-muted">The profile owner needs to accept these terms first.</p>}
        </Section>
      </div>
    );
  }

  const q = typeof sp.q === "string" ? sp.q : "";
  const archived = sp.show === "archived";
  const patients = await listPatients(p.id, { q, archived });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Patients" lede="Only you and team members with patient-record permission can see these. Every view is logged." action={access.canWrite ? <a href="#add" className="btn btn-primary py-2 text-sm">Add patient</a> : undefined} />
      <Notice ok={msg.ok} error={msg.error} />

      <Section title={archived ? "Archived patients" : "Patients"} aside={<Link href={archived ? "/workspace/patients" : "/workspace/patients?show=archived"} className="text-sm underline">{archived ? "Show active" : "Show archived"}</Link>}>
        <form className="mb-4 flex gap-2" role="search">
          {archived ? <input type="hidden" name="show" value="archived" /> : null}
          <input name="q" type="search" className="input" defaultValue={q} placeholder="Search by name, mobile or ref no" aria-label="Search patients" />
          <button type="submit" className="btn btn-secondary py-2 text-sm">Search</button>
        </form>
        {patients.length === 0 ? <Empty>{q ? "No patients match." : "No patients yet."}</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="py-1">Patient</th><th>Mobile</th><th>Last visit</th><th>Next visit</th></tr></thead>
            <tbody className="divide-y divide-line border-y border-line">
              {patients.map((x) => (
                <tr key={x.id}>
                  <td className="py-2"><Link href={`/workspace/patients/${x.id}`} className="font-medium underline-offset-2 hover:underline">{x.fullName}</Link> <span className="text-muted">· {x.refNo}{x.age ? ` · ${x.age} y` : ""}{x.sex ? ` · ${x.sex[0].toUpperCase()}` : ""}</span></td>
                  <td>{x.mobile ?? "—"}</td>
                  <td>{fmt(x.lastVisitOn)}</td>
                  <td>{fmt(x.nextVisitOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {access.canWrite && !archived ? (
        <form action={createPatientAction}>
          <Section id="add" title="Add patient">
            <PatientFields />
            <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" name="consent" className="mt-1" required /> <span>The patient knows I am keeping their record on The Physio Index and has agreed.</span></label>
            <div className="mt-4"><button type="submit" className="btn btn-primary">Add patient</button></div>
          </Section>
        </form>
      ) : null}
    </div>
  );
}

function Denied({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Patient records" />
      <p className="card mt-6 p-5 text-sm">{text}</p>
    </div>
  );
}
