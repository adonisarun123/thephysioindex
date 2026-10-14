import { track } from "@/lib/analytics";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  AwardIcon, BriefcaseIcon, CalendarIcon, CapIcon, CheckIcon, ClockIcon, DirectionsIcon, DocIcon, HomeIcon,
  LanguageIcon, LinkIcon, PhoneIcon, PinIcon, ShieldCheckIcon, StarIcon, VideoIcon,
} from "@/components/profile/icons";
import { SectionNav } from "@/components/profile/section-nav";
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
    <Suspense fallback={<div className="mx-auto max-w-[1280px] px-4 py-8 text-muted md:px-6">Loading profile…</div>}>
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
  if (p.listingStatus === "published") void track("profile_view", { practitionerId: p.id }); // ANA-02

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
  const initials = p.displayName.split(/\s+/).filter((w) => !/^dr\.?$/i.test(w)).slice(0, 2).map((w) => w[0]).join("");
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

  // Display hint only: the booking flow re-checks eligibility server-side (BKG-06, LOC-04).
  const bookableOnline = (b: PublicProfile["branches"][number], o: PublicProfile["branches"][number]["offerings"][number]) =>
    p.bookable && b.bookable && o.mode === "clinic" && o.bookingMode === "instant";

  // Cancellation summary comes from the same policy/config the engine enforces (BKG-15), never a hard-coded number.
  const cutoffs = new Set(
    p.branches.flatMap((b) => b.offerings.filter((o) => bookableOnline(b, o)).map((o) => o.cutoffHours)),
  );
  const cancellationLine =
    cutoffs.size === 1 && [...cutoffs][0] != null
      ? `Free cancellation up to ${formatHours([...cutoffs][0] as number)} before`
      : cutoffs.size > 1
        ? "Cancellation terms vary by service and are shown before you confirm"
        : null;

  const sections = (
    [
      ["overview", "About", Boolean(p.about)],
      ["expertise", "Expertise", p.specialties.length > 0],
      ["clinics", "Clinics & fees", true],
      ["registrations", "Registrations", true],
      ["experience", "Experience", p.experiences.length > 0],
      ["education", "Education", p.qualifications.length > 0],
      ["reviews", "Reviews", true],
      ["achievements", "Achievements", p.portfolio.length > 0],
    ] as const
  )
    .filter(([, , show]) => show)
    .map(([id, label]) => ({ id, label }));

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-36 pt-4 md:px-6 md:pt-6 lg:pb-16 xl:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(practitionerJsonLd(p, siteUrl)) }} />
      <Breadcrumbs siteUrl={siteUrl} items={crumbs} />

      {/* First screen (PUB-07): identity, credentials label, location, fee basis. Precedes biography on every width. */}
      <section aria-labelledby="profile-name" className="card mt-4 p-5 md:p-8">
        <div className="flex gap-4 md:gap-6">
          <div aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-xl font-semibold text-brand-ink md:h-24 md:w-24 md:text-3xl">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 id="profile-name" className="t-page text-navy">{p.displayName}</h1>
            <p className="mt-1 text-base text-muted md:text-lg">
              {p.designation ?? "Physiotherapist"}
              {p.qualifications[0] ? <> · {p.qualifications[0].degree}</> : null}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <VerificationBadge category={p.verification} size="md" />
              {p.reviewCount > 0 && p.ratingAvgX100 != null ? (
                <span className="pill badge-neutral px-3 py-1 text-sm">
                  <StarIcon className="h-3.5 w-3.5" /> {(p.ratingAvgX100 / 100).toFixed(1)} · {p.reviewCount} appointment review{p.reviewCount === 1 ? "" : "s"}
                </span>
              ) : null}
              {!p.claimed ? <span className="pill badge-neutral px-3 py-1 text-sm">Profile not yet claimed</span> : null}
            </div>
          </div>
        </div>

        {p.headline ? <p className="t-body-lg mt-5 max-w-3xl">{p.headline}</p> : null}

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-5 md:gap-x-6 lg:grid-cols-4">
          {primaryBranch ? (
            <Fact icon={<PinIcon />} label="Location">
              {primaryBranch.localityName}, {primaryBranch.cityName}
              {p.branches.length > 1 ? <span className="text-muted"> +{p.branches.length - 1} more</span> : null}
            </Fact>
          ) : null}
          {practisingSince ? (
            <Fact icon={<BriefcaseIcon />} label="Practising since">
              {practisingSince}
            </Fact>
          ) : null}
          {p.languages.length ? (
            <Fact icon={<LanguageIcon />} label="Languages">
              {p.languages.map((l) => l.label).join(", ")}
            </Fact>
          ) : null}
          <Fact icon={<ClockIcon />} label="Fee">
            {minFee != null ? <>From {formatPaise(minFee)}</> : "On enquiry"}
            {minFee != null ? <span className="text-muted"> per session</span> : null}
          </Fact>
        </dl>
      </section>

      {/* Direct child of the page container so it stays sticky for the whole profile. */}
      <SectionNav items={sections} />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="grid min-w-0 gap-6">
          {p.about ? (
            <Section id="overview" title="About">
              <p className="max-w-[70ch] whitespace-pre-line leading-relaxed">{p.about}</p>
            </Section>
          ) : null}

          {p.specialties.length ? (
            <Section id="expertise" title="Areas of practice">
              <ul className="flex flex-wrap gap-2">
                {p.specialties.map((s) => (
                  <li key={s.slug} className={`chip ${s.isPrimary ? "chip-selected" : ""}`}>
                    {s.isPrimary ? <CheckIcon className="h-3.5 w-3.5" /> : null}
                    {s.label}
                    {s.isPrimary ? <span className="sr-only"> (primary)</span> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section id="clinics" title="Clinics, services and fees">
            {p.branches.length === 0 ? (
              <p className="text-muted">No approved clinic location yet.</p>
            ) : (
              <div className="grid gap-5">
                {p.branches.map((b) => (
                  <article key={b.id} className="overflow-hidden rounded-[var(--r-panel)] border border-line">
                    <div className="flex flex-wrap items-start justify-between gap-4 bg-surface-2 p-4 md:p-5">
                      <div className="min-w-0">
                        <h3 className="t-card">
                          <Link href={b.clinicPath} className="hover:underline">{b.clinicName}</Link>
                          {b.name && b.name !== b.clinicName ? <span className="font-normal text-muted"> · {b.name}</span> : null}
                        </h3>
                        <p className="mt-1 flex gap-1.5 text-sm text-muted">
                          <PinIcon className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>
                            {[b.addressLine1, b.addressLine2, b.localityName, b.cityName].filter(Boolean).join(", ")} {b.pinCode}
                          </span>
                        </p>
                        {b.facilities?.length ? (
                          <ul className="mt-3 flex flex-wrap gap-1.5">
                            {b.facilities.map((f) => (
                              <li key={f} className="pill badge-neutral">{f}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {b.publicPhone ? (
                          <a href={`tel:${b.publicPhone.replace(/\s+/g, "")}`} className="btn btn-quiet btn-sm bg-surface">
                            <PhoneIcon /> Call
                          </a>
                        ) : null}
                        {b.latitude != null && b.longitude != null ? (
                          <a href={`https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`} rel="noopener noreferrer" target="_blank" className="btn btn-quiet btn-sm bg-surface">
                            <DirectionsIcon /> Directions
                          </a>
                        ) : null}
                      </div>
                    </div>

                    {b.offerings.length ? (
                      <ul className="divide-y divide-line">
                        {b.offerings.map((o) => {
                          const online = bookableOnline(b, o);
                          const extra = o.taxPaise + o.extraChargesPaise;
                          return (
                            <li key={o.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center md:px-5">
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2 font-medium">
                                  {o.displayName}
                                  {o.mode !== "clinic" ? (
                                    <span className="pill badge-info">
                                      {o.mode === "home_visit" ? <HomeIcon className="h-3 w-3" /> : <VideoIcon className="h-3 w-3" />}
                                      {o.mode === "home_visit" ? "Home visit" : "Online"}
                                    </span>
                                  ) : null}
                                </p>
                                <p className="mt-0.5 text-sm text-muted">
                                  {o.durationMin} min{o.priceNote ? ` · ${o.priceNote}` : ""}
                                </p>
                              </div>
                              <div className="flex items-center justify-between gap-4 sm:justify-end">
                                <div className="sm:text-right">
                                  <p className="font-semibold">{formatPaise(o.basePricePaise)}</p>
                                  {extra > 0 ? <p className="text-xs text-muted">+ {formatPaise(extra)} taxes &amp; charges</p> : null}
                                </div>
                                {online ? (
                                  <Link href={`${p.path}/book?o=${o.id}`} className="btn btn-secondary btn-sm w-24">
                                    Book
                                  </Link>
                                ) : (
                                  <Link href={`${p.path}/enquire`} className="btn btn-quiet btn-sm w-24" title="This service is not bookable online">
                                    Enquire
                                  </Link>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="p-4 text-sm text-muted md:px-5">Services and fees are not published for this location.</p>
                    )}
                  </article>
                ))}
                <p className="text-sm text-muted">
                  Home visits and online sessions are arranged by enquiry and are not booked online. Fees are set by the clinic and paid at the clinic.
                </p>
              </div>
            )}
          </Section>

          <Section
            id="registrations"
            title="Registrations and verification"
            aside={<Link href="/help#verification" className="text-sm font-medium text-brand hover:underline">How verification works</Link>}
          >
            <p className="text-sm text-muted">{verification.explanation} Labels describe the check performed, not treatment quality.</p>
            {p.credentials.length ? (
              <ul className="mt-4 grid gap-3">
                {p.credentials.map((c, i) => {
                  const tone = credentialTone(c.status);
                  return (
                    <li key={i} className="flex gap-3 rounded-[var(--r-panel)] border border-line p-4">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.badge}`}>
                        {c.status === "registration_checked" ? <ShieldCheckIcon /> : <DocIcon />}
                      </span>
                      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">{c.authorityName}</p>
                          <p className="text-sm text-muted">
                            {credentialTypeLabel(c.type)}
                            {c.jurisdiction ? ` · ${c.jurisdiction}` : ""}
                            {c.publicNumber ? <> · No. <span className="font-medium text-foreground">{c.publicNumber}</span></> : null}
                          </p>
                          {c.scopeOfCheck ? <p className="mt-1 text-sm text-muted">Check: {c.scopeOfCheck}</p> : null}
                        </div>
                        <div className="sm:text-right">
                          <span className={`pill ${tone.badge}`}>{credentialStatusLabel(c.type, c.status)}</span>
                          {c.lastCheckedAt ? <p className="mt-1 text-xs text-muted">Checked {formatDate(c.lastCheckedAt)}</p> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-3 text-sm">No credentials have been submitted for review yet.</p>
            )}
          </Section>

          {p.experiences.length ? (
            <Section id="experience" title="Experience" note="Roles are self-declared. Overlapping roles are not added together.">
              <ol className="relative grid gap-6 border-l-2 border-line pl-6">
                {p.experiences.map((e, i) => (
                  <li key={i} className="relative">
                    <span aria-hidden className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full ring-4 ring-surface ${e.endMonth ? "bg-line-strong" : "bg-brand"}`} />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="font-semibold">{e.role}</p>
                      <p className="text-sm text-muted">
                        {formatMonth(e.startMonth)} – {e.endMonth ? formatMonth(e.endMonth) : "Present"}
                      </p>
                    </div>
                    <p className="text-sm text-muted">{e.organisationName}</p>
                    {e.description ? <p className="mt-2 max-w-[70ch] text-sm leading-relaxed">{e.description}</p> : null}
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          {p.qualifications.length ? (
            <Section id="education" title="Education">
              <ul className="grid gap-4">
                {p.qualifications.map((q, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-brand-ink">
                      <CapIcon />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4">
                      <div className="min-w-0">
                        <p className="font-medium">{q.degree}</p>
                        <p className="text-sm text-muted">{q.institution}</p>
                      </div>
                      <p className="text-sm text-muted">{q.inProgress ? "In progress" : q.completionYear ?? ""}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section id="reviews" title="Appointment reviews" note="Reviews come from completed platform appointments and are moderated. They do not verify clinical outcomes.">
            {p.reviews.length === 0 ? (
              <div className="well flex items-center gap-3 p-4 text-sm">
                <StarIcon className="h-5 w-5 text-muted" />
                <p>
                  No appointment reviews yet. <span className="text-muted">Only patients with a completed appointment can review.</span>
                </p>
              </div>
            ) : (
              <ul className="grid gap-4">
                {p.reviews.map((r, i) => (
                  <li key={i} className="rounded-[var(--r-panel)] border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{r.displayName}</p>
                      <p className="text-sm text-muted">
                        <span className="font-medium text-foreground">{r.rating} / 5</span> · {formatDate(r.publishedAt)}
                      </p>
                    </div>
                    {r.text ? <p className="mt-2 text-sm leading-relaxed">{r.text}</p> : null}
                    {r.reply ? (
                      <div className="well mt-3 p-3 text-sm">
                        <p className="font-medium">Reply from {p.displayName}</p>
                        <p className="mt-1">{r.reply}</p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {p.portfolio.length ? (
            <Section id="achievements" title="Achievements and memberships">
              <ul className="grid gap-4 sm:grid-cols-2">
                {p.portfolio.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-brand-ink">
                      {item.kind === "website" || item.kind === "social" || item.kind === "publication" ? <LinkIcon /> : <AwardIcon />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {item.url ? (
                          <a href={item.url} rel="noopener noreferrer nofollow" target="_blank" className="text-brand hover:underline">{item.title}</a>
                        ) : (
                          item.title
                        )}
                      </p>
                      <p className="text-sm text-muted">
                        {[portfolioKindLabel(item.kind), item.issuer, item.itemDate ? formatDate(item.itemDate) : null].filter(Boolean).join(" · ")}
                      </p>
                      {item.description ? <p className="mt-1 text-sm">{item.description}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <p className="flex flex-wrap gap-x-4 gap-y-2 px-1 text-sm text-muted">
            <Link href="/help#report" className="hover:underline">Report this profile</Link>
            <Link href="/help#correction" className="hover:underline">Request a correction</Link>
            {!p.claimed ? <Link href={`/claim/${p.publicId}`} className="hover:underline">Is this you? Claim this profile</Link> : null}
            <span>Profile ID {p.publicId}</span>
          </p>
        </div>

        {/* Booking rail (desktop). Sticky inside the grid, so it stops above the footer. Below lg the bottom bar carries the action. */}
        <aside className="hidden lg:sticky lg:top-40 lg:block" aria-label="Book an appointment">
          <div id="book" className="card p-6" style={{ boxShadow: "var(--shadow-2)" }}>
            <h2 className="t-card">{p.bookable ? "Book an appointment" : "Contact this practice"}</h2>
            {minFee != null ? (
              <p className="mt-3">
                <span className="text-sm text-muted">From </span>
                <span className="text-3xl font-semibold text-navy">{formatPaise(minFee)}</span>
                <span className="text-sm text-muted"> / session</span>
              </p>
            ) : (
              <p className="mt-3 text-muted">Fees on enquiry</p>
            )}

            {p.branches.length ? (
              <ul className="mt-5 grid gap-2">
                {p.branches.map((b) => {
                  const branchMin = b.offerings.length ? Math.min(...b.offerings.map((o) => o.basePricePaise)) : null;
                  return (
                    <li key={b.id} className="flex gap-3 rounded-[var(--r-ctl)] bg-surface-2 p-3 text-sm">
                      <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      <div className="min-w-0">
                        <p className="font-medium">{b.name && b.name !== b.clinicName ? b.name : b.localityName}</p>
                        <p className="text-muted">
                          {b.offerings.length} service{b.offerings.length === 1 ? "" : "s"}
                          {branchMin != null ? ` · from ${formatPaise(branchMin)}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className="mt-5 grid gap-2">
              {p.bookable ? (
                <Link href={`${p.path}/book`} className="btn btn-primary w-full">
                  <CalendarIcon /> Choose appointment
                </Link>
              ) : (
                <>
                  {/* Enquiry for unbookable profiles: not a booking, reserves nothing (Section 2) */}
                  <Link href={`${p.path}/enquire`} className="btn btn-primary w-full">Send an enquiry</Link>
                  {primaryBranch?.publicPhone ? (
                    <a href={`tel:${primaryBranch.publicPhone.replace(/\s+/g, "")}`} className="btn btn-quiet w-full">
                      <PhoneIcon /> Call clinic
                    </a>
                  ) : null}
                </>
              )}
            </div>

            {p.bookable ? (
              <ul className="mt-5 grid gap-2 text-sm">
                {["Instant confirmation", cancellationLine, "Pay at the clinic"].filter((t): t is string => Boolean(t)).map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <CheckIcon className="h-4 w-4 text-success" /> {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-muted">Online booking is not available for this profile. An enquiry is not a booking.</p>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile booking bar: fee context + one action, safe-area padding; page reserves space beneath (PUB-07). */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden" style={{ boxShadow: "var(--shadow-2)" }}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{minFee != null ? <>From {formatPaise(minFee)}</> : "Fees on enquiry"}</p>
            <p className="truncate text-xs text-muted">{p.bookable ? "Instant confirmation" : "Online booking unavailable"}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {!p.bookable && primaryBranch?.publicPhone ? (
              <a href={`tel:${primaryBranch.publicPhone.replace(/\s+/g, "")}`} className="btn btn-quiet btn-sm" aria-label="Call clinic">
                <PhoneIcon />
              </a>
            ) : null}
            <Link href={p.bookable ? `${p.path}/book` : `${p.path}/enquire`} className="btn btn-primary btn-sm">
              {p.bookable ? "Book appointment" : "Enquire"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, note, aside, children }: { id: string; title: string; note?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="card scroll-mt-32 p-4 sm:p-5 md:scroll-mt-40 md:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${id}-h`} className="t-section text-navy">{title}</h2>
        {aside}
      </div>
      {children}
      {note ? <p className="mt-4 text-xs text-muted">{note}</p> : null}
    </section>
  );
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-ink">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className="text-sm font-medium">{children}</dd>
      </div>
    </div>
  );
}

function formatHours(h: number) {
  if (h > 0 && h % 24 === 0) return `${h / 24} day${h === 24 ? "" : "s"}`;
  return `${h} hour${h === 1 ? "" : "s"}`;
}

function credentialTone(status: string) {
  if (status === "registration_checked") return { badge: "badge-success" };
  if (status === "document_reviewed") return { badge: "badge-info" };
  if (status === "expired" || status === "suspended" || status === "revoked" || status === "unverifiable") return { badge: "badge-error" };
  return { badge: "badge-warning" };
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
