import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getPublicClinic } from "@/lib/directory";
import { clinicJsonLd } from "@/lib/profile-jsonld";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function publicIdFrom(slugWithId: string) {
  const idx = slugWithId.lastIndexOf("-");
  return idx >= 0 ? slugWithId.slice(idx + 1) : slugWithId;
}

export async function generateMetadata({ params }: PageProps<"/clinics/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const c = await getPublicClinic(publicIdFrom(slug));
  if (!c) return { title: "Clinic not found", robots: { index: false } };
  const b = c.branches[0];
  return {
    title: `${c.name}${b ? `, ${b.localityName}, ${b.cityName}` : ""} — physiotherapy clinic`,
    description: c.about ?? `${c.name}: locations, physiotherapists and contact details.`,
    alternates: { canonical: c.path },
  };
}

export default function Page({ params }: PageProps<"/clinics/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 text-muted">Loading clinic…</div>}>
      <ClinicPage params={params} />
    </Suspense>
  );
}

async function ClinicPage({ params }: { params: PageProps<"/clinics/[slug]">["params"] }) {
  const { slug } = await params;
  await connection();
  const c = await getPublicClinic(publicIdFrom(slug));
  if (!c) notFound();
  if (slug !== `${c.slug}-${c.publicId}`) permanentRedirect(c.path);
  const b0 = c.branches[0];
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(clinicJsonLd(c, siteUrl)) }} />
      <Breadcrumbs
        siteUrl={siteUrl}
        items={[
          { label: "Home", href: "/" },
          { label: "Physiotherapists", href: "/physiotherapists" },
          ...(b0 ? [{ label: b0.stateName, href: `/physiotherapists/${b0.stateSlug}` }, { label: b0.cityName, href: `/physiotherapists/${b0.stateSlug}/${b0.citySlug}` }] : []),
          { label: c.name },
        ]}
      />
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">{c.name}</h1>
      <p className="mt-1 text-muted">Physiotherapy clinic{b0 ? ` in ${b0.cityName}` : ""}{c.branches.length > 1 ? `, ${c.branches.length} locations` : ""}</p>
      {c.about ? <p className="mt-4 max-w-2xl leading-relaxed">{c.about}</p> : null}
      <p className="mt-2 text-sm">
        {c.publicPhone ? <a href={`tel:${c.publicPhone}`} className="underline">{c.publicPhone}</a> : null}
        {c.website ? (
          <>
            {c.publicPhone ? " · " : ""}
            <a href={c.website} rel="noopener noreferrer nofollow" target="_blank" className="underline">Website</a>
          </>
        ) : null}
      </p>

      <div className="mt-8 grid gap-6">
        {c.branches.map((b) => (
          <section key={b.id} className="rounded-lg border border-line bg-surface p-5">
            <h2 className="text-xl font-semibold">{b.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {[b.addressLine1, b.addressLine2].filter(Boolean).join(", ")},{" "}
              <Link href={`/physiotherapists/${b.stateSlug}/${b.citySlug}/${b.localitySlug}`} className="underline">{b.localityName}</Link>, {b.cityName} {b.pinCode}
            </p>
            <p className="mt-1 text-sm">
              {b.publicPhone ? <a href={`tel:${b.publicPhone}`} className="underline">{b.publicPhone}</a> : null}
              {b.latitude != null && b.longitude != null ? (
                <>
                  {b.publicPhone ? " · " : ""}
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`} rel="noopener noreferrer" target="_blank" className="underline">Directions</a>
                </>
              ) : null}
            </p>
            {b.workingHours ? (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer">Clinic hours</summary>
                <ul className="mt-2 grid gap-0.5 sm:grid-cols-2">
                  {WEEKDAYS.map((d, i) => {
                    const w = b.workingHours?.[String(i)] ?? [];
                    return (
                      <li key={d} className="flex justify-between gap-4 border-b border-line py-1">
                        <span>{d}</span>
                        <span className="text-muted">{w.length ? w.map((x) => `${x.open}–${x.close}`).join(", ") : "Closed"}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-1 text-xs text-muted">Clinic hours are not a practitioner&rsquo;s availability. Each physiotherapist publishes their own slots.</p>
              </details>
            ) : null}
            {b.facilities?.length ? <p className="mt-2 text-sm text-muted">Facilities: {b.facilities.join(", ")}</p> : null}
            <h3 className="mt-4 font-semibold">Physiotherapists at this location</h3>
            {b.practitioners.length ? (
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {b.practitioners.map((p) => (
                  <li key={p.publicId}>
                    <Link href={`/physiotherapist/${p.slug}-${p.publicId}`} className="underline">{p.displayName}</Link>
                    {p.designation ? <span className="text-muted">, {p.designation}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">No published physiotherapist profiles at this location yet.</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
