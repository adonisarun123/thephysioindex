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
        <p className="font-medium">Ready to start?</p>
        <p className="mt-1 text-sm text-muted">Sign in with your mobile number, check whether a listing already exists for you, then claim it or create a new profile. Drafts save as you go.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {/* /claim requires a practitioner sign-in; anonymous visitors are redirected to /sign-in?as=practitioner&next=/claim (PRO-02). */}
          <Link href="/claim" className="btn btn-primary">Create or claim your profile</Link>
          <Link href="/workspace" className="btn btn-quiet">Open my workspace</Link>
        </div>
      </div>
      <section className="mt-10 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <p className="font-semibold">1. Search first</p>
          <p className="mt-1 text-muted">Imported listings exist for many practitioners. Claim yours to take control of what patients see.</p>
        </div>
        <div>
          <p className="font-semibold">2. Complete your profile</p>
          <p className="mt-1 text-muted">Identity, credentials, clinics, services and fees. Submit for review when ready.</p>
        </div>
        <div>
          <p className="font-semibold">3. Publish availability</p>
          <p className="mt-1 text-muted">Weekly hours per clinic, leave and blocks. Booking opens once your profile and eligibility are approved.</p>
        </div>
      </section>
    </div>
  );
}
