import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { VerificationBadge } from "@/components/verification-badge";
import { getPublicProfile, resolvePractitionerSlug, type PublicProfile } from "@/lib/directory";
import { formatPaise } from "@/lib/money";
import { practitionerJsonLd } from "@/lib/profile-jsonld";
import { VERIFICATION_LABELS } from "@/lib/verification";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

async function load(slugWithId: string) {
  const resolved = await resolvePractitionerSlug(slugWithId);
  if (!resolved) return null;
  const profile = await getPublicProfile(resolved.publicId);
  return profile ? { profile, canonicalSlug: `${resolved.slug}-${resolved.publicId}` } : null;
}

export async function generateMetadata({ params }: PageProps<"/physiotherapist/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "Profile not found", robots: { index: false } };
  const { profile: p } = data;
  if (p.listingStatus !== "published") return { title: "Profile unavailable", robots: { index: false, follow: false } };
  const where = p.branches[0] ? ` in ${p.branches[0].localityName}, ${p.branches[0].cityName}` : "";
  return {
    title: `${p.displayName}, ${p.designation ?? "Physiotherapist"}${where}`,
    description:
      p.headline ??
      `${p.displayName} — ${p.specialties.map((s) => s.label).slice(0, 3).join(", ") || "physiotherapy"}${where}. Qualifications, registrations, fees and appointment booking.`,
    alternates: { canonical: p.path },
    openGraph: { type: "profile", title: p.displayName, description: p.headline ?? undefined, url: p.path },
  };
}

export default function Page({ params }: PageProps<"/physiotherapist/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 text-muted">Loading profile…</div>}>
      <ProfilePage params={params} />
    </Suspense>
  );
}

async function ProfilePage({ params }: { params: PageProps<"/physiotherapist/[slug]">["params"] }) {
  const { slug } = await params;
  await connection();
  const data = await load(slug);
  if (!data) notFound();
  const { profile: p, canonicalSlug } = data;
  if (slug !== canonicalSlug) permanentRedirect(`/physiotherapist/${canonicalSlug}`); // DIR-06, SEO-05

  if (p.listingStatus === "suspended") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-semibold">This profile is currently unavailable</h1>
        <p className="mt-2 text-muted">The listing is under review and cannot take bookings. Existing appointments are being handled directly with patients.</p>
        <Link href="/physiotherapists" className="mt-6 inline-block underline">Find other physiotherapists</Link>
      </div>
    );
  }

  const primaryBranch = p.branches[0];
  const fees = p.branches.flatMap((b) => b.offerings.map((o) => o.basePricePaise));
  const minFee = fees.length ? Math.min(...fees) : null;
  const practisingSince = practisingSinceYear(p);
  const verification = VERIFICATION_LABELS[p.verification];
  const crumbs = [
    { label: "Home", href: "/" },
    { label: "Physiotherapists", href: "/physiotherapists" },
    ...(primaryBranch
      ? [
          { label: primaryBranch.stateName, href: `/physiotherapists/${primaryBranch.stateSlug}` },
          { label: primaryBranch.cityName, href: `/physiotherapists/${primaryBranch.stateSlug}/${primaryBranch.citySlug}` },
          { label: primaryBranch.localityName, href: `/physiotherapists/${primaryBranch.stateSlug}/${primaryBranch.citySlug}/${primaryBranch.localitySlug}` },
        ]
      : []),
    { label: p.displayName },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-28 lg:pb-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(practitionerJsonLd(p, siteUrl)) }} />
      <Breadcrumbs siteUrl={siteUrl} items={crumbs} />

      <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_20rem]">
        {/* Summary first on mobile (DIR-02) */}
        <header className="lg:col-span-2">
          <div className="flex flex-wrap items-start gap-4">
            <div aria-hidden className="flex h-20 w-20 items-center justify-center rounded-lg bg-brand-soft text-2xl font-semibold text-brand-ink">
              {p.displayName.split(/\s+/).filter((w) => !/^dr\.?$/i.test(w)).slice(0, 2).map((w) => w[0]).join("")}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-semibold tracking-tight">{p.displayName}</h1>
              <p className="mt-1 text-lg text-muted">
                {p.designation ?? "Physiotherapist"}
                {p.qualifications[0] ? `, ${p.qualifications[0].degree}` : ""}
              </p>
              {p.headline ? <p className="mt-2 max-w-2xl">{p.headline}</p> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <VerificationBadge category={p.verification} size="md" />
                {primaryBranch ? (
                  <span className="text-muted">
                    {primaryBranch.localityName}, {primaryBranch.cityName}
                    {p.branches.length > 1 ? ` and ${p.branches.length - 1} more` : ""}
                  </span>
                ) : null}
                {practisingSince ? <span className="text-muted">Practising since {practisingSince}</span> : null}
              </div>
            </div>
          </div>
        </header>

        <main className="min-w-0">
          {p.about ? (
            <Section id="overview" title="About">
              <p className="whitespace-pre-line leading-relaxed">{p.about}</p>
            </Section>
          ) : null}

          {p.specialties.length ? (
            <Section id="expertise" title="Areas of practice">
              <ul className="flex flex-wrap gap-2">
                {p.specialties.map((s) => (
                  <li key={s.slug} className={`rounded-full border px-3 py-1 text-sm ${s.isPrimary ? "border-brand bg-brand-soft text-brand-ink" : "border-line bg-surface"}`}>
                    {s.label}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section id="registrations" title="Registrations and verification">
            <p className="text-sm text-muted">{verification.explanation} Labels describe the check performed, not treatment quality.</p>
            {p.credentials.length ? (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {p.credentials.map((c, i) => (
                  <li key={i} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:gap-4">
                    <div>
                      <p className="font-medium">{c.authorityName}</p>
                      <p className="text-sm text-muted">
                        {credentialTypeLabel(c.type)}
                        {c.jurisdiction ? `, ${c.jurisdiction}` : ""}
                        {c.publicNumber ? ` · No. ${c.publicNumber}` : ""}
                      </p>
                      {c.scopeOfCheck ? <p className="text-sm text-muted">Scope of check: {c.scopeOfCheck}</p> : null}
                    </div>
                    <div className="text-sm sm:text-right">
                      <p className="font-medium">{credentialStatusLabel(c.type, c.status)}</p>
                      {c.lastCheckedAt ? <p className="text-muted">Checked {formatDate(c.lastCheckedAt)}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm">No credentials have been submitted for review yet.</p>
            )}
          </Section>

          {p.qualifications.length ? (
            <Section id="education" title="Education">
              <ul className="divide-y divide-line border-y border-line">
                {p.qualifications.map((q, i) => (
                  <li key={i} className="flex justify-between gap-4 py-3">
                    <div>
                      <p className="font-medium">{q.degree}</p>
                      <p className="text-sm text-muted">{q.institution}</p>
                    </div>
                    <p className="text-sm text-muted">{q.inProgress ? "In progress" : q.completionYear ?? ""}</p>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {p.experiences.length ? (
            <Section id="experience" title="Experience">
              <ul className="divide-y divide-line border-y border-line">
                {p.experiences.map((e, i) => (
                  <li key={i} className="py-3">
                    <div className="flex justify-between gap-4">
                      <p className="font-medium">{e.role}</p>
                      <p className="shrink-0 text-sm text-muted">
                        {formatMonth(e.startMonth)} – {e.endMonth ? formatMonth(e.endMonth) : "present"}
                      </p>
                    </div>
                    <p className="text-sm text-muted">{e.organisationName}</p>
                    {e.description ? <p className="mt-1 text-sm">{e.description}</p> : null}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">Roles are self-declared. Overlapping roles are not added together.</p>
            </Section>
          ) : null}

          <Section id="clinics" title="Clinics and services">
            {p.branches.length === 0 ? (
              <p className="text-sm text-muted">No approved clinic location yet.</p>
            ) : (
              <div className="grid gap-6">
                {p.branches.map((b) => (
                  <article key={b.id} className="rounded-lg border border-line bg-surface p-4">
                    <h3 className="font-semibold">
                      <Link href={b.clinicPath} className="hover:underline">{b.clinicName}</Link>
                      {b.name && b.name !== b.clinicName ? <span className="text-muted"> — {b.name}</span> : null}
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      {[b.addressLine1, b.addressLine2].filter(Boolean).join(", ")}, {b.localityName}, {b.cityName} {b.pinCode}
                    </p>
                    <p className="mt-1 text-sm">
                      {b.publicPhone ? <a href={`tel:${b.publicPhone}`} className="underline">{b.publicPhone}</a> : null}
                      {b.latitude != null && b.longitude != null ? (
                        <>
                          {b.publicPhone ? " · " : ""}
                          <a href={`https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`} rel="noopener noreferrer" target="_blank" className="underline">
                            Directions
                          </a>
                        </>
                      ) : null}
                    </p>
                    {b.facilities?.length ? <p className="mt-2 text-sm text-muted">Facilities: {b.facilities.join(", ")}</p> : null}
                    {b.offerings.length ? (
                      <table className="mt-3 w-full text-sm">
                        <caption className="sr-only">Services and fees at {b.clinicName}</caption>
                        <thead>
                          <tr className="text-left text-muted">
                            <th className="py-1 font-normal">Service</th>
                            <th className="py-1 font-normal">Duration</th>
                            <th className="py-1 text-right font-normal">Fee</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.offerings.map((o) => (
                            <tr key={o.id} className="border-t border-line">
                              <td className="py-2">
                                <span className="font-medium">{o.displayName}</span>
                                {o.priceNote ? <span className="block text-muted">{o.priceNote}</span> : null}
                              </td>
                              <td className="py-2">{o.durationMin} min</td>
                              <td className="py-2 text-right">
                                {formatPaise(o.basePricePaise)}
                                {o.taxPaise + o.extraChargesPaise > 0 ? <span className="block text-xs text-muted">+ {formatPaise(o.taxPaise + o.extraChargesPaise)} taxes/charges</span> : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="mt-2 text-sm text-muted">Services and fees not published for this location.</p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </Section>

          <Section id="availability" title="Availability">
            {p.bookable ? (
              <p className="text-sm">Online booking opens with the appointment release. Until then, contact the clinic directly.</p>
            ) : p.bookingPaused ? (
              <p className="text-sm">Online booking is currently unavailable for this practitioner. Contact the clinic directly.</p>
            ) : !p.claimed ? (
              <p className="text-sm" id="claim">
                This profile has not been claimed, so no appointment slots are published. Are you {p.displayName}?{" "}
                <Link href="/for-physiotherapists" className="underline">Claim this profile</Link>.
              </p>
            ) : (
              <p className="text-sm">Online booking is not yet enabled for this profile.</p>
            )}
          </Section>

          <Section id="reviews" title={`Appointment reviews${p.reviewCount ? ` (${p.reviewCount})` : ""}`}>
            {p.reviews.length === 0 ? (
              <p className="text-sm text-muted">No reviews yet. Only patients with a completed appointment can review.</p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {p.reviews.map((r, i) => (
                  <li key={i} className="py-3">
                    <p className="text-sm">
                      <span className="font-medium">{r.rating}/5</span> <span className="text-muted">by {r.displayName}, {formatDate(r.publishedAt)}</span>
                    </p>
                    {r.text ? <p className="mt-1">{r.text}</p> : null}
                    {r.reply ? <p className="mt-2 border-l-2 border-line pl-3 text-sm text-muted">Reply: {r.reply}</p> : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">Reviews are from platform appointments and are moderated. They do not verify clinical outcomes.</p>
          </Section>

          {p.portfolio.length ? (
            <Section id="achievements" title="Achievements and memberships">
              <ul className="divide-y divide-line border-y border-line">
                {p.portfolio.map((item, i) => (
                  <li key={i} className="py-3">
                    <p className="font-medium">
                      {item.url ? (
                        <a href={item.url} rel="noopener noreferrer nofollow" target="_blank" className="underline">{item.title}</a>
                      ) : (
                        item.title
                      )}
                    </p>
                    <p className="text-sm text-muted">
                      {[portfolioKindLabel(item.kind), item.issuer, item.itemDate ? formatDate(item.itemDate) : null].filter(Boolean).join(", ")}
                    </p>
                    {item.description ? <p className="mt-1 text-sm">{item.description}</p> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <p className="mt-10 text-xs text-muted">
            <Link href={`/help#report`} className="underline">Report this profile</Link> · <Link href={`/help#correction`} className="underline">Request a correction</Link> · Profile ID {p.publicId}
          </p>
        </main>

        <aside className="order-first lg:order-none lg:sticky lg:top-4 lg:self-start">
          <div id="book" className="rounded-lg border border-line bg-surface p-4">
            {minFee != null ? (
              <>
                <p className="text-2xl font-semibold">{formatPaise(minFee)}</p>
                <p className="text-sm text-muted">starting fee, pay at clinic</p>
              </>
            ) : (
              <p className="text-sm text-muted">Fees on enquiry</p>
            )}
            <div className="mt-4">
              {p.bookable ? (
                <button type="button" disabled className="w-full cursor-not-allowed rounded-md bg-brand px-4 py-2 font-medium text-white opacity-70">
                  Book an appointment
                </button>
              ) : primaryBranch?.publicPhone ? (
                <a href={`tel:${primaryBranch.publicPhone}`} className="block w-full rounded-md border border-brand px-4 py-2 text-center font-medium text-brand-ink hover:bg-brand-soft">
                  Call clinic
                </a>
              ) : (
                <Link href="#clinics" className="block w-full rounded-md border border-line px-4 py-2 text-center font-medium hover:border-brand">
                  See clinic details
                </Link>
              )}
            </div>
            <p className="mt-3 text-xs text-muted">
              {p.bookable ? "Instant confirmation. Cancel free up to 12 hours before." : "Online booking is not available for this profile."}
            </p>
          </div>
          <nav aria-label="On this page" className="mt-4 hidden text-sm lg:block">
            <ul className="grid gap-1 text-muted">
              {[
                ["overview", "About", Boolean(p.about)],
                ["expertise", "Areas of practice", p.specialties.length > 0],
                ["registrations", "Registrations", true],
                ["education", "Education", p.qualifications.length > 0],
                ["experience", "Experience", p.experiences.length > 0],
                ["clinics", "Clinics and services", true],
                ["availability", "Availability", true],
                ["reviews", "Reviews", true],
                ["achievements", "Achievements", p.portfolio.length > 0],
              ]
                .filter(([, , show]) => show)
                .map(([id, label]) => (
                  <li key={id as string}>
                    <a href={`#${id}`} className="hover:underline">{label as string}</a>
                  </li>
                ))}
            </ul>
          </nav>
        </aside>
      </div>

      {/* Persistent booking action on mobile; keyboard reachable; does not cover content (DIR-02) */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="font-semibold">{minFee != null ? formatPaise(minFee) : "Fees on enquiry"}</p>
            <p className="text-xs text-muted">{p.bookable ? "Instant confirmation" : "Online booking unavailable"}</p>
          </div>
          <a href="#book" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white">
            {p.bookable ? "Book" : "Contact"}
          </a>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-6 first:mt-0">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function practisingSinceYear(p: PublicProfile): number | null {
  // PRO-11: use the approved practice start date; otherwise the earliest declared role. Never sum concurrent roles.
  if (p.practiceStartDate) return new Date(p.practiceStartDate).getFullYear();
  const starts = p.experiences.map((e) => new Date(e.startMonth).getFullYear()).filter((y) => Number.isFinite(y));
  return starts.length ? Math.min(...starts) : null;
}

function credentialTypeLabel(type: string) {
  return (
    {
      statutory_registration: "Statutory registration",
      enrolment: "Enrolment identifier (not a licence)",
      degree: "Degree",
      association_membership: "Association membership (not a licence)",
      certification: "Certification",
    } as Record<string, string>
  )[type] ?? type;
}

function credentialStatusLabel(type: string, status: string) {
  if (status === "registration_checked") return type === "enrolment" ? "Enrolment checked" : "Registration checked";
  if (status === "document_reviewed") return "Document reviewed";
  if (status === "expired") return "Expired";
  if (status === "suspended" || status === "revoked") return "Not active";
  if (status === "unverifiable") return "Could not be verified";
  return "Pending review";
}

function portfolioKindLabel(kind: string) {
  return ({ award: "Award", certification: "Certification", membership: "Membership", publication: "Publication", website: "Website", social: "Profile" } as Record<string, string>)[kind] ?? kind;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
