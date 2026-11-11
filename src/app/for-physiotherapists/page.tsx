import type { Metadata } from "next";
import Link from "next/link";
import { KEEP_READY, ONBOARDING_FAQ, TO_GO_LIVE } from "@/lib/content/physio-onboarding";

export const metadata: Metadata = {
  title: "For physiotherapists — list your practice",
  description: "List your physiotherapy practice free. See what to keep ready, how registration and verification work, and answers to common questions.",
  alternates: { canonical: "/for-physiotherapists" },
};

/** FAQPage structured data built from the same list the page renders (SEO-03). */
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: ONBOARDING_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
};

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }} />
      <h1 className="text-3xl font-semibold tracking-tight">List your physiotherapy practice</h1>
      <p className="mt-3 text-lg text-muted">A professional profile, your clinics and services, and a conflict-free calendar — in one workspace.</p>
      <ul className="mt-6 grid gap-3 text-sm">
        <li className="card p-4"><strong>Create or claim.</strong> Search for an existing listing first; claims are reviewed so nobody can take over your profile with a phone number alone.</li>
        <li className="card p-4"><strong>Verified labels, not vague badges.</strong> We show exactly what was checked: registration, enrolment, degree or membership.</li>
        <li className="card p-4"><strong>No listing fee or commission at launch.</strong> Patients pay at your clinic.</li>
      </ul>
      <div className="mt-8 card bg-brand-soft p-6">
        <p className="font-medium">Ready to start?</p>
        <p className="mt-1 text-sm text-muted">Registration takes about two minutes and creates your profile straight away. If a listing already exists for you, claim it instead.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/for-physiotherapists/join" className="btn btn-primary">Register free</Link>
          {/* /claim requires a practitioner sign-in; anonymous visitors are redirected to /sign-in?as=practitioner&next=/claim (PRO-02). */}
          <Link href="/claim" className="btn btn-quiet">Claim an existing profile</Link>
          <Link href="/workspace" className="btn btn-quiet">Open my workspace</Link>
        </div>
      </div>

      <section className="mt-12" aria-labelledby="keep-ready">
        <h2 id="keep-ready" className="text-2xl font-semibold tracking-tight">Registration checklist</h2>
        <p className="mt-2 text-sm text-muted">Keep these four things at hand and registration takes about two minutes.</p>
        <Checklist items={KEEP_READY} />
        <h3 className="mt-8 text-lg font-semibold">To reach 100% and go live</h3>
        <p className="mt-1 text-sm text-muted">One more screen after registration. Most of it is pre-filled or tick boxes.</p>
        <Checklist items={TO_GO_LIVE} />
      </section>

      <section className="mt-12 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <p className="font-semibold">1. Register</p>
          <p className="mt-1 text-muted">Name, verified email, mobile, qualification, registration number and where you see patients.</p>
        </div>
        <div>
          <p className="font-semibold">2. Complete your profile</p>
          <p className="mt-1 text-muted">Photo, About, areas of practice, languages, a service with its fee and clinic hours. Submit at 100%.</p>
        </div>
        <div>
          <p className="font-semibold">3. Get verified</p>
          <p className="mt-1 text-muted">We check your registration and email you when your profile is live. Booking opens once your profile and eligibility are approved.</p>
        </div>
      </section>

      <section className="mt-12" aria-labelledby="faq">
        <h2 id="faq" className="text-2xl font-semibold tracking-tight">Questions physiotherapists ask</h2>
        <dl className="mt-5 grid gap-3">
          {ONBOARDING_FAQ.map((f) => (
            <div key={f.q} className="card p-4">
              <dt className="font-semibold">{f.q}</dt>
              <dd className="mt-1 text-sm text-muted">{f.a}</dd>
            </div>
          ))}
        </dl>
        <Link href="/for-physiotherapists/join" className="btn btn-primary mt-6">Register free</Link>
      </section>
    </div>
  );
}

function Checklist({ items }: { items: { title: string; detail: string }[] }) {
  return (
    <ul className="mt-4 grid gap-3 text-sm">
      {items.map((i) => (
        <li key={i.title} className="flex gap-3">
          <span aria-hidden className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded border border-current text-xs text-muted">✓</span>
          <span><strong className="block">{i.title}</strong><span className="text-muted">{i.detail}</span></span>
        </li>
      ))}
    </ul>
  );
}
