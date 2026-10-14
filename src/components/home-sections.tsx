import Link from "next/link";
import { connection } from "next/server";
import { listAllPublished } from "@/lib/content/public";

/**
 * Home-page sections. Layout patterns (audience routing, condition cards,
 * care-mode explainer, closing call to action) are adapted for a directory;
 * colours, type and radii come only from the Visual Design Specification.
 * No aggregate outcome or satisfaction figures: the platform does not yet
 * hold data that would support them (DIR-14 honesty principle).
 */

const AUDIENCES = [
  { title: "For a parent or older relative", body: "Physiotherapists who list geriatric care: balance, mobility and strength after illness or a fall.", slug: "geriatric-physiotherapy", tag: "Geriatric" },
  { title: "Back and neck pain", body: "Spine and back care for desk-related pain, stiffness and recurring episodes.", slug: "spine-and-back-care", tag: "Spine" },
  { title: "Sports and running injuries", body: "Sprains, strains and return-to-sport plans from sports physiotherapists.", slug: "sports-physiotherapy", tag: "Sports" },
  { title: "After surgery", body: "Rehabilitation after joint replacement, ligament repair, fracture fixation and spine surgery.", slug: "post-surgical-rehabilitation", tag: "Post-surgical" },
  { title: "Women's health", body: "Pelvic floor, pregnancy and postnatal physiotherapy.", slug: "women-s-health-and-pelvic-floor", tag: "Women's health" },
  { title: "Stroke and neurological conditions", body: "Rehabilitation for stroke, Parkinson's, spinal cord and other neurological conditions.", slug: "neurological-rehabilitation", tag: "Neuro" },
] as const;

export function AudienceGrid() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 py-12 md:px-6" aria-labelledby="audiences">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand">Who are you looking for?</p>
      <h2 id="audiences" className="t-section mt-1 max-w-2xl">Start from the problem, not the job title</h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {AUDIENCES.map((a) => (
          <li key={a.slug}>
            <Link
              href={`/physiotherapists?specialty=${a.slug}`}
              className="card group flex h-full flex-col p-6 transition-shadow hover:border-brand hover:shadow-[var(--shadow-2)]"
            >
              <span className="pill self-start bg-brand-soft text-brand-ink">{a.tag}</span>
              <span className="t-card mt-3 text-navy">{a.title}</span>
              <span className="mt-2 flex-1 text-sm leading-relaxed text-muted">{a.body}</span>
              <span className="mt-4 text-sm font-semibold text-brand group-hover:underline">
                See physiotherapists <span aria-hidden>→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Condition cards: title plus the published one-line summary. Renders nothing until conditions are published. */
export async function ConditionGrid() {
  await connection();
  const all = await listAllPublished("condition").catch(() => []);
  const items = all.filter((c) => c.dek).slice(0, 6);
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-[1280px] px-4 py-12 md:px-6" aria-labelledby="conditions">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">Conditions</p>
          <h2 id="conditions" className="t-section mt-1">How physiotherapy helps common conditions</h2>
        </div>
        <Link href="/conditions" className="text-sm font-medium text-brand underline">All conditions A to Z</Link>
      </div>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <li key={c.id}>
            <Link href={c.path} className="group flex h-full flex-col rounded-[var(--r-card)] bg-surface-2 p-6 transition-colors hover:bg-brand-soft">
              <span className="t-card text-navy">{c.title}</span>
              <span className="mt-2 flex-1 text-sm leading-relaxed text-ink-2">{c.dek}</span>
              <span className="mt-4 text-sm font-semibold text-brand group-hover:underline">
                Read the guide <span aria-hidden>→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ConditionGridSkeleton() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-12 md:px-6" aria-busy>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-[var(--r-card)] bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

/** Book vs enquire, stated up front (LOC-04, CAL-04, BKG-06: home visits and online sessions are enquiry-only in R1). */
export function CareModes() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 py-12 md:px-6" aria-labelledby="care-modes">
      <h2 id="care-modes" className="t-section">Two ways to see a physiotherapist</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card flex flex-col p-6 md:p-8">
          <span className="text-sm font-semibold text-brand">01</span>
          <h3 className="t-card mt-2 text-navy">Book a clinic visit</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
            Pick a free slot from the physiotherapist&apos;s own calendar and get a confirmed appointment reference straight away. Pay at the clinic.
          </p>
          <Link href="/physiotherapists?bookable=1" className="btn btn-primary mt-5 self-start">Find bookable clinics</Link>
        </div>
        <div className="card flex flex-col p-6 md:p-8">
          <span className="text-sm font-semibold text-brand">02</span>
          <h3 className="t-card mt-2 text-navy">Enquire about home visits or online sessions</h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
            Physiotherapists who offer home visits or video sessions show it on their profile. Send an enquiry and agree a time with them directly.
          </p>
          <Link href="/physiotherapists?specialty=home-based-rehabilitation" className="btn btn-quiet mt-5 self-start">Find home-visit physiotherapists</Link>
        </div>
      </div>
    </section>
  );
}

/** Closing patient call to action: primary search plus a lower-commitment path. */
export function PatientCta() {
  return (
    <section className="mx-auto max-w-[1280px] px-4 pb-16 pt-4 md:px-6">
      <div className="hero-panel grid gap-6 p-8 md:grid-cols-[1fr_auto] md:items-center md:p-12">
        <div>
          <h2 className="t-section text-navy">Ready to find the right physiotherapist?</h2>
          <p className="mt-2 max-w-xl text-ink-2">Compare qualifications, registration checks and fees, then book or enquire. Free for patients.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/physiotherapists" className="btn btn-primary">Find a physiotherapist</Link>
          <Link href="/conditions" className="btn btn-quiet bg-surface">Read about a condition</Link>
        </div>
      </div>
    </section>
  );
}
