import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { SearchForm } from "@/components/search-form";
import { listStates } from "@/lib/geo";

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
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:pt-12">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h1 className="max-w-xl text-4xl font-bold leading-[1.05] sm:text-6xl">Find the right physiotherapist. Book the next free slot.</h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink-2">
              Reviewed profiles across India with qualifications, registration checks and fees you can compare. Pay at the clinic.
            </p>
            <div className="mt-8 max-w-xl">
              <SearchForm />
            </div>
            <ul className="mt-5 flex flex-wrap gap-2 text-sm">
              {METROS.map(([name, href]) => (
                <li key={name}>
                  <Link href={href} className="pill border border-line bg-surface px-3 py-1 font-medium hover:border-brand">
                    {name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/physiotherapists" className="pill px-3 py-1 font-medium text-brand-ink underline">
                  All states
                </Link>
              </li>
            </ul>
          </div>
          <Arcs />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Every listing is reviewed", "Profiles go live only after a reviewer has checked them. Credential labels say exactly what was checked and when."],
            ["Real availability, instant confirmation", "Slots come from each physiotherapist's own calendar. One booking holds one time. Cancel free up to 12 hours before."],
            ["Compare before you book", "Qualifications, areas of practice, languages, fees and clinic locations side by side. No hidden charges."],
          ].map(([title, body]) => (
            <div key={title} className="card p-6">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-bold">Browse by state or union territory</h2>
          <Link href="/physiotherapists" className="text-sm font-medium text-brand-ink underline">All locations</Link>
        </div>
        <Suspense fallback={<StateGridSkeleton />}>
          <StateGrid />
        </Suspense>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="card grid gap-6 bg-brand-deep p-8 text-white sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h2 className="text-2xl font-bold">Are you a physiotherapist?</h2>
            <p className="mt-2 max-w-xl text-white/80">
              Create or claim your profile, publish your clinics and fees, and manage one conflict-free calendar across every location. No listing fee or commission at launch.
            </p>
          </div>
          <Link href="/for-physiotherapists" className="btn bg-white text-brand-deep hover:bg-brand-soft">
            List your practice
          </Link>
        </div>
      </section>
    </>
  );
}

/** Range-of-motion arcs: the one decorative motif, used once. */
function Arcs() {
  return (
    <div aria-hidden className="relative hidden aspect-square w-full max-w-md justify-self-end lg:block">
      <svg viewBox="0 0 400 400" className="h-full w-full">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--moss-soft)" />
            <stop offset="1" stopColor="var(--surface)" />
          </linearGradient>
        </defs>
        <rect width="400" height="400" rx="28" fill="url(#g)" />
        {[150, 120, 90, 60].map((r, i) => (
          <path
            key={r}
            d={`M ${200 - r} 260 A ${r} ${r} 0 0 1 ${200 + r} 260`}
            fill="none"
            stroke={i === 1 ? "var(--amber)" : "var(--moss)"}
            strokeWidth={i === 3 ? 10 : 6}
            strokeLinecap="round"
            opacity={1 - i * 0.18}
          />
        ))}
        <circle cx="200" cy="260" r="9" fill="var(--moss-ink)" />
        <text x="200" y="330" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--moss-ink)">
          Range of motion, restored
        </text>
      </svg>
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
