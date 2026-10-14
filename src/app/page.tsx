import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { SearchForm } from "@/components/search-form";
import { listStates } from "@/lib/geo";
import { AudienceGrid, CareModes, ConditionGrid, ConditionGridSkeleton, PatientCta } from "@/components/home-sections";

const METROS = [
  ["Bengaluru", "/physiotherapists/karnataka/bengaluru"],
  ["Mumbai", "/physiotherapists/maharashtra/mumbai"],
  ["Delhi", "/physiotherapists/delhi/delhi"],
  ["Hyderabad", "/physiotherapists/telangana/hyderabad"],
  ["Chennai", "/physiotherapists/tamil-nadu/chennai"],
  ["Pune", "/physiotherapists/maharashtra/pune"],
  ["Kolkata", "/physiotherapists/west-bengal/kolkata"],
  ["Ahmedabad", "/physiotherapists/gujarat/ahmedabad"],
] as const;

export default function Home() {
  return (
    <>
      {/* PUB-01: search is the dominant hero element; imagery is secondary (spec §7). */}
      <section className="mx-auto max-w-[1280px] px-4 pb-12 pt-8 md:px-6 md:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <h1 className="t-display max-w-2xl text-navy">Find a physiotherapist near you.</h1>
            <p className="t-body-lg mt-5 max-w-xl text-ink-2">
              Local profiles with qualifications, registration checks and fees you can compare, and appointments you can book. Pay at the clinic.
            </p>
            <div className="hero-panel mt-8 max-w-2xl p-3 sm:p-4">
              <SearchForm />
            </div>
            <ul className="mt-5 flex flex-wrap gap-2">
              {METROS.map(([name, href]) => (
                <li key={name}>
                  <Link href={href} className="chip hover:border-brand">
                    {name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/physiotherapists" className="chip chip-selected">
                  All states
                </Link>
              </li>
            </ul>
          </div>
          <HowItWorks />
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-12 md:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Every listing is reviewed", "Profiles go live only after a reviewer has checked them. Credential labels say exactly what was checked and when."],
            ["Real availability, instant confirmation", "Slots come from each physiotherapist's own calendar. One booking holds one time. Cancel free up to 12 hours before."],
            ["Compare before you book", "Qualifications, areas of practice, languages, fees and clinic locations side by side. No hidden charges."],
          ].map(([title, body]) => (
            <div key={title} className="card p-6">
              <h2 className="t-card">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <AudienceGrid />
      <CareModes />
      <Suspense fallback={<ConditionGridSkeleton />}>
        <ConditionGrid />
      </Suspense>

      <section className="mx-auto max-w-[1280px] px-4 py-12 md:px-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="t-section">Browse by state or union territory</h2>
          <Link href="/physiotherapists" className="text-sm font-medium text-brand underline">All locations</Link>
        </div>
        <Suspense fallback={<StateGridSkeleton />}>
          <StateGrid />
        </Suspense>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-12 md:px-6">
        <div className="grid gap-6 rounded-[var(--r-hero)] bg-navy p-8 text-white md:grid-cols-[1fr_auto] md:items-center md:p-12">
          <div>
            <h2 className="t-section">Are you a physiotherapist?</h2>
            <p className="mt-2 max-w-xl text-white/85">
              Create or claim your profile, publish your clinics and fees, and manage one conflict-free calendar across every location. No listing fee or commission at launch.
            </p>
          </div>
          <Link href="/for-physiotherapists" className="btn bg-white text-navy hover:bg-brand-soft">
            Find my profile
          </Link>
        </div>
      </section>

      <PatientCta />
    </>
  );
}

/** Three-step explanation in a soft mint panel (stands in for photography until brand imagery is supplied). */
function HowItWorks() {
  const steps = [
    ["Search", "Pick a city or locality, or type a name or area of practice."],
    ["Compare", "Read qualifications, registration checks, fees and clinic details."],
    ["Book", "Choose a slot, confirm your mobile, and get an appointment reference."],
  ];
  return (
    <div className="well p-6 md:p-8">
      <p className="t-card text-navy">How it works</p>
      <ol className="mt-4 grid gap-4">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-4">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-semibold text-brand">
              {i + 1}
            </span>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

async function StateGrid() {
  await connection();
  const states = await listStates();
  return (
    <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {states.map((s) => (
        <li key={s.id}>
          <Link href={`/physiotherapists/${s.slug}`} className="card block px-4 py-3 hover:border-brand">
            <span className="font-semibold">{s.name}</span>
            <span className="block text-xs text-muted">
              {s.cityCount} {s.cityCount === 1 ? "city" : "cities"}
              {s.publishedPractitionerCount > 0 ? `, ${s.publishedPractitionerCount} physiotherapists` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StateGridSkeleton() {
  return (
    <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-busy>
      {Array.from({ length: 12 }).map((_, i) => (
        <li key={i} className="card h-16 animate-pulse" />
      ))}
    </ul>
  );
}
