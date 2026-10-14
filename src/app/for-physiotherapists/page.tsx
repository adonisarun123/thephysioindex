import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "For physiotherapists — list your practice",
  description: "Create or claim your professional profile, publish your availability and receive appointment bookings. No listing fee at launch.",
  alternates: { canonical: "/for-physiotherapists" },
};

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">List your physiotherapy practice</h1>
      <p className="mt-3 text-lg text-muted">A professional profile, your clinics and services, and a conflict-free calendar — in one workspace.</p>
      <ul className="mt-6 grid gap-3 text-sm">
        <li className="card p-4"><strong>Create or claim.</strong> Search for an existing listing first; claims are reviewed so nobody can take over your profile with a phone number alone.</li>
        <li className="card p-4"><strong>Verified labels, not vague badges.</strong> We show exactly what was checked: registration, enrolment, degree or membership.</li>
        <li className="card p-4"><strong>No listing fee or commission at launch.</strong> Patients pay at your clinic.</li>
      </ul>
      <div className="mt-8 card bg-brand-soft p-6">
        <p className="font-medium">Onboarding opens with the next release.</p>
        <p className="mt-1 text-sm text-muted">Registration, claims and the practitioner workspace are being built now. <Link href="/" className="underline">Back to home</Link>.</p>
      </div>
    </div>
  );
}
