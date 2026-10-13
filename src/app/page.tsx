import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { SearchForm } from "@/components/search-form";
import { listStates } from "@/lib/geo";

export default function Home() {
  return (
    <>
      <section className="bg-brand-soft">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <p className="text-sm font-medium uppercase tracking-wide text-brand-ink">India-wide physiotherapist directory</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
            Find a physiotherapist near you and book an appointment.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            Compare qualifications, registrations, fees and availability — then book a clinic visit. Pay at the clinic.
          </p>
          <div className="mt-8 max-w-2xl">
            <SearchForm />
          </div>
          <p className="mt-3 text-sm text-muted">
            Or <Link href="/physiotherapists" className="underline">browse by state and city</Link>.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-xl font-semibold">Browse by state or union territory</h2>
        <Suspense fallback={<StateGridSkeleton />}>
          <StateGrid />
        </Suspense>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12">
        <div className="grid gap-6 rounded-xl border border-line bg-surface p-6 sm:grid-cols-3">
          <div>
            <h3 className="font-semibold">Reviewed listings</h3>
            <p className="mt-1 text-sm text-muted">Every profile is reviewed before it is published. Credential labels say exactly what was checked.</p>
          </div>
          <div>
            <h3 className="font-semibold">Real availability</h3>
            <p className="mt-1 text-sm text-muted">Slots come from the practitioner&rsquo;s own calendar. A confirmed booking holds the time for you.</p>
          </div>
          <div>
            <h3 className="font-semibold">Are you a physiotherapist?</h3>
            <p className="mt-1 text-sm text-muted">
              <Link href="/for-physiotherapists" className="underline">Create or claim your profile</Link> and manage your calendar in one place.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

async function StateGrid() {
  await connection();
  const states = await listStates();
  return (
    <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {states.map((s) => (
        <li key={s.id}>
          <Link href={`/physiotherapists/${s.slug}`} className="block rounded-md border border-line bg-surface px-3 py-2 hover:border-brand">
            <span className="font-medium">{s.name}</span>
            <span className="block text-xs text-muted">
              {s.cityCount} {s.cityCount === 1 ? "city" : "cities"}
              {s.publishedPractitionerCount > 0 ? ` · ${s.publishedPractitionerCount} physiotherapists` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function StateGridSkeleton() {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-busy>
      {Array.from({ length: 12 }).map((_, i) => (
        <li key={i} className="h-14 animate-pulse rounded-md border border-line bg-surface" />
      ))}
    </ul>
  );
}
