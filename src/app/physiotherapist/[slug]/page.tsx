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
import { ShareButton } from "@/components/profile/share-button";
import { VerificationBadge } from "@/components/verification-badge";
import { getPublicProfile, resolvePractitionerSlug, type PublicProfile } from "@/lib/directory";
import { listPublishedByPractitioner } from "@/lib/content/public";
import { formatPaise } from "@/lib/money";
import { DEFAULT_OG_IMAGE, faqPageJsonLd, ldJson } from "@/lib/seo/jsonld";
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
    openGraph: { type: "profile", title: p.displayName, description: p.headline ?? undefined, url: p.path, images: [p.photo ? { url: p.photo.large, width: 800, height: 800, alt: `${p.displayName}, physiotherapist` } : DEFAULT_OG_IMAGE] },
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
  // Guides this physiotherapist wrote and our team published; a failed lookup must not take the profile down.
  const articles = p.listingStatus === "published" ? await listPublishedByPractitioner(p.id).catch(() => []) : [];

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

  // Display-only polish: names typed in all lower case ("vanshita budhi") read as unfinished. Never alters stored data or JSON-LD.
  const name = p.displayName === p.displayName.toLowerCase() ? titleCase(p.displayName) : p.displayName;
  // Short name for headings and FAQs: first real given name; skip titles, initials and the TEST marker used on preview data.
  const firstName = name.split(/\s+/).find((w) => w.length > 2 && !w.endsWith(".") && !/^(dr|test)$/i.test(w)) ?? name;
  const modes = new Set<"clinic" | "home_visit" | "online">();
  for (const b of p.branches) {
    if (b.kind === "service_area") modes.add("home_visit");
    else modes.add("clinic");
    for (const o of b.offerings) modes.add(o.mode);
  }
  const serviceCount = p.branches.reduce((n, b) => n + b.offerings.length, 0);
  const homeAreas = p.branches.filter((b) => b.kind === "service_area").map((b) => b.localityName);
  const clinicCount = p.branches.filter((b) => b.kind === "clinic").length;
  const phone = primaryBranch?.publicPhone?.replace(/\s+/g, "") ?? null;
  const ctaHref = p.bookable ? `${p.path}/book` : `${p.path}/enquire`;
  const ctaLabel = p.bookable ? "Book appointment" : "Send an enquiry";
  const localityHref = primaryBranch
    ? `/physiotherapists/${primaryBranch.stateSlug}/${primaryBranch.citySlug}/${primaryBranch.localitySlug}`
    : null;
  const cityHref = primaryBranch ? `/physiotherapists/${primaryBranch.stateSlug}/${primaryBranch.citySlug}` : null;

  const steps = p.bookable
    ? [
        ["Pick a service and time", "Choose from the published services and open slots."],
        ["Get instant confirmation", "You receive a booking reference straight away."],
        ["Pay at the clinic", "No online payment. Fees are paid at your appointment."],
      ]
    : [
        ["Send a short enquiry", "Your name, mobile number and what you need help with."],
        [`${firstName} calls you back`, "To understand the problem and agree a time."],
        ["Nothing is booked until you agree", "An enquiry reserves nothing and costs nothing."],
      ];

  // Answers are built only from published profile fields (DIR-14: no invented claims).
  const faqs: { q: string; a: string }[] = [];
  if (p.branches.length) {
    faqs.push({
      q: `Where does ${firstName} practise?`,
      a: p.branches
        .map((b) => (b.kind === "service_area" ? `Home visits in and around ${b.localityName}, ${b.cityName}` : `${b.clinicName}, ${b.localityName}, ${b.cityName}`))
        .join("; ") + ".",
    });
  }
  if (modes.has("home_visit")) {
    faqs.push({
      q: `Does ${firstName} offer physiotherapy at home?`,
      a: `Yes. ${firstName} visits patients at home${homeAreas.length ? ` in ${homeAreas.join(", ")}` : ""}. Home visits are arranged by enquiry, not booked online.`,
    });
  }
  if (minFee != null) {
    faqs.push({
      q: `How much does a session with ${firstName} cost?`,
      a: `Published fees start from ${formatPaise(minFee)} per session. Each service above lists its own fee and duration; fees are set by the practitioner.`,
    });
  }
  if (p.languages.length) {
    faqs.push({ q: `Which languages does ${firstName} speak?`, a: `${p.languages.map((l) => l.label).join(", ")}.` });
  }
  faqs.push({
    q: `How do I get an appointment with ${firstName}?`,
    a: p.bookable
      ? "Choose a service and an open time on this page. You get instant confirmation and pay at the clinic."
      : `Send an enquiry from this page with your name and mobile number. ${firstName} will call you back to arrange a time. Nothing is booked until you both agree.`,
  });
  faqs.push({ q: `Is ${firstName}'s registration verified?`, a: `${verification.explanation} Labels describe the check performed, not treatment quality.` });

  const sections = (
    [
      ["overview", "About", Boolean(p.about)],
      ["expertise", "Expertise", p.specialties.length > 0],
      ["clinics", p.branches.every((b) => b.kind === "service_area") && p.branches.length ? "Services & fees" : "Clinics & fees", true],
      ["registrations", "Registrations", true],
      ["experience", "Experience", p.experiences.length > 0],
      ["education", "Education", p.qualifications.length > 0],
      ["reviews", "Reviews", true],
      ["achievements", "Achievements", p.portfolio.length > 0],
      ["articles", "Articles", articles.length > 0],
      ["faq", "FAQs", true],
    ] as const
  )
    .filter(([, , show]) => show)
    .map(([id, label]) => ({ id, label }));

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-36 pt-4 md:px-6 md:pt-6 lg:pb-16 xl:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(practitionerJsonLd(p, siteUrl)) }} />
      {/* SEO-03: the FAQ answers below are rendered as the same plain text further down the page. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldJson(faqPageJsonLd(new URL(p.path, siteUrl).toString(), faqs.map((f) => ({ question: f.q, answer: f.a })))) }}
      />
      <Breadcrumbs siteUrl={siteUrl} items={crumbs} />

      {/* First screen (PUB-07): identity, credentials label, location, fee basis. Precedes biography on every width. */}
      <section aria-labelledby="profile-name" className="relative mt-4 overflow-hidden rounded-[var(--r-hero)] border border-line bg-surface" style={{ boxShadow: "var(--shadow-2)" }}>
        <div aria-hidden className="profile-hero-band h-28 md:h-40" />
        <div className="relative px-5 pb-6 md:px-8 md:pb-8">
          <div className="-mt-14 flex flex-col gap-5 md:-mt-20 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
              {p.photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- ImageKit serves the sized, metadata-free variant
                <img src={p.photo.url} srcSet={`${p.photo.url} 1x, ${p.photo.large} 2x`} alt={`${name}, physiotherapist`} width={144} height={144} fetchPriority="high" className="h-28 w-28 shrink-0 rounded-[28px] bg-surface object-cover ring-[6px] ring-surface md:h-36 md:w-36" />
              ) : (
                <div aria-hidden className="profile-avatar flex h-28 w-28 shrink-0 items-center justify-center rounded-[28px] text-4xl font-semibold tracking-tight text-white ring-[6px] ring-surface md:h-36 md:w-36 md:text-5xl">
                  {initials.toUpperCase()}
                </div>
              )}
              <div className="min-w-0 sm:pt-[68px] md:pt-[92px]">
                <h1 id="profile-name" className="text-3xl font-bold leading-tight tracking-tight text-navy md:text-4xl">{name}</h1>
                <p className="mt-1 text-base text-muted md:text-lg">
                  {p.designation ?? "Physiotherapist"}
                  {p.qualifications[0] ? <> · <span className="font-medium text-foreground">{p.qualifications[0].degree}</span></> : null}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <VerificationBadge category={p.verification} size="md" />
                  {modes.has("home_visit") ? <span className="pill badge-info px-3 py-1 text-sm"><HomeIcon className="h-3.5 w-3.5" /> Home visits</span> : null}
                  {modes.has("clinic") ? <span className="pill badge-success px-3 py-1 text-sm"><BriefcaseIcon className="h-3.5 w-3.5" /> In-clinic</span> : null}
                  {modes.has("online") ? <span className="pill badge-info px-3 py-1 text-sm"><VideoIcon className="h-3.5 w-3.5" /> Online sessions</span> : null}
                  {p.reviewCount > 0 && p.ratingAvgX100 != null ? (
                    <span className="pill badge-warning px-3 py-1 text-sm">
                      <StarIcon className="h-3.5 w-3.5" /> {(p.ratingAvgX100 / 100).toFixed(1)} · {p.reviewCount} review{p.reviewCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {!p.claimed ? <span className="pill badge-neutral px-3 py-1 text-sm">Profile not yet claimed</span> : null}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 lg:pt-[92px]">
              <Link href={ctaHref} className="btn btn-primary profile-cta">
                {p.bookable ? <CalendarIcon /> : null} {ctaLabel}
              </Link>
              {phone ? (
                <a href={`tel:${phone}`} className="btn btn-quiet">
                  <PhoneIcon /> Call
                </a>
              ) : null}
              <ShareButton title={`${name} — physiotherapist on The Physio Index`} className="btn btn-quiet" />
            </div>
          </div>

          {p.headline ? <p className="t-body-lg mt-6 max-w-3xl text-foreground">{p.headline}</p> : null}

          {/* At a glance: every tile is a published fact; tiles without data are omitted. */}
          <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile icon={<ClockIcon />} label="Session fee">
              {minFee != null ? (
                <>
                  <span className="text-2xl font-bold text-navy">{formatPaise(minFee)}</span>
                  <span className="block text-xs font-normal text-muted">starting fee per session</span>
                </>
              ) : (
                <span className="text-lg font-semibold text-navy">On enquiry</span>
              )}
            </Tile>
            {primaryBranch ? (
              <Tile icon={modes.has("home_visit") && !clinicCount ? <HomeIcon /> : <PinIcon />} label={clinicCount ? "Where" : "Visits homes in"}>
                <span className="text-lg font-semibold text-navy">{primaryBranch.localityName}</span>
                <span className="block text-xs font-normal text-muted">
                  {primaryBranch.cityName}
                  {p.branches.length > 1 ? ` · +${p.branches.length - 1} more area${p.branches.length > 2 ? "s" : ""}` : ""}
                </span>
              </Tile>
            ) : null}
            {p.languages.length ? (
              <Tile icon={<LanguageIcon />} label="Speaks">
                <span className="text-lg font-semibold text-navy">
                  {p.languages.length} language{p.languages.length === 1 ? "" : "s"}
                </span>
                <span className="block truncate text-xs font-normal text-muted">{p.languages.map((l) => l.label).join(", ")}</span>
              </Tile>
            ) : null}
            {practisingSince ? (
              <Tile icon={<BriefcaseIcon />} label="Practising since">
                <span className="text-lg font-semibold text-navy">{practisingSince}</span>
                <span className="block text-xs font-normal text-muted">{new Date().getFullYear() - practisingSince > 0 ? `${new Date().getFullYear() - practisingSince}+ years` : "This year"}</span>
              </Tile>
            ) : (
              <Tile icon={<DocIcon />} label="Services">
                <span className="text-lg font-semibold text-navy">{serviceCount || "—"}</span>
                <span className="block text-xs font-normal text-muted">{serviceCount ? `published service${serviceCount === 1 ? "" : "s"}` : "not yet published"}</span>
              </Tile>
            )}
          </dl>
        </div>
      </section>

      {/* Direct child of the page container so it stays sticky for the whole profile. */}
      <SectionNav items={sections} />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="grid min-w-0 gap-6">
          {p.about ? (
            <Section id="overview" title={`About ${firstName}`} icon={<DocIcon />}>
              <p className="max-w-[70ch] whitespace-pre-line border-l-4 border-teal pl-4 text-[1.0625rem] leading-relaxed text-foreground">{p.about}</p>
            </Section>
          ) : null}

          {p.specialties.length ? (
            <Section id="expertise" title="Areas of practice" icon={<AwardIcon />}>
              <ul className="flex flex-wrap gap-2">
                {p.specialties.map((s) => (
                  <li key={s.slug} className={`chip ${s.isPrimary ? "chip-selected" : ""} px-4 py-2 text-[0.9375rem]`}>
                    {s.isPrimary ? <CheckIcon className="h-4 w-4" /> : null}
                    {s.label}
                    {s.isPrimary ? <span className="sr-only"> (primary)</span> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section
            id="clinics"
            icon={modes.has("home_visit") && !clinicCount ? <HomeIcon /> : <PinIcon />}
            title={p.branches.length && p.branches.every((b) => b.kind === "service_area") ? "Home visits, services and fees" : "Clinics, services and fees"}
          >
            {p.branches.length === 0 ? (
              <p className="text-muted">No approved clinic location yet.</p>
            ) : (
              <div className="grid gap-5">
                {p.branches.map((b) => (
                  <article key={b.id} className="overflow-hidden rounded-[var(--r-panel)] border border-line">
                    <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-r from-surface-2 to-surface p-4 md:p-5">
                      <div className="flex min-w-0 gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy text-white">
                          {b.kind === "service_area" ? <HomeIcon /> : <PinIcon />}
                        </span>
                        <div className="min-w-0">
                          <h3 className="t-card">
                            {b.kind === "service_area" ? `Home visits · ${b.localityName}` : b.clinicPath ? <Link href={b.clinicPath} className="hover:underline">{b.clinicName}</Link> : b.clinicName}
                            {b.kind !== "service_area" && b.name && b.name !== b.clinicName ? <span className="font-normal text-muted"> · {b.name}</span> : null}
                          </h3>
                          <p className="mt-0.5 text-sm text-muted">
                            {b.kind === "service_area"
                              ? `Visits patients at home in and around ${b.localityName}, ${b.cityName}`
                              : `${[b.addressLine1, b.addressLine2, b.localityName, b.cityName].filter(Boolean).join(", ")} ${b.pinCode ?? ""}`}
                          </p>
                          {b.facilities?.length ? (
                            <ul className="mt-3 flex flex-wrap gap-1.5">
                              {b.facilities.map((f) => (
                                <li key={f} className="pill badge-neutral">{f}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
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
                      <ul className="grid gap-3 p-3 sm:grid-cols-2 md:p-4">
                        {b.offerings.map((o) => {
                          const online = bookableOnline(b, o);
                          const extra = o.taxPaise + o.extraChargesPaise;
                          return (
                            <li key={o.id} className="profile-lift flex flex-col justify-between gap-4 rounded-[var(--r-panel)] border border-line bg-surface p-4">
                              <div className="min-w-0">
                                <div className="flex items-start justify-between gap-3">
                                  <p className="font-semibold leading-snug">{o.displayName}</p>
                                  <span className={`pill shrink-0 ${o.mode === "clinic" ? "badge-success" : "badge-info"}`}>
                                    {o.mode === "home_visit" ? <HomeIcon className="h-3 w-3" /> : o.mode === "online" ? <VideoIcon className="h-3 w-3" /> : <BriefcaseIcon className="h-3 w-3" />}
                                    {o.mode === "home_visit" ? "Home visit" : o.mode === "online" ? "Online" : "Clinic"}
                                  </span>
                                </div>
                                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                                  <ClockIcon className="h-3.5 w-3.5" /> {o.durationMin} min{o.priceNote ? ` · ${o.priceNote}` : ""}
                                </p>
                              </div>
                              <div className="flex items-end justify-between gap-3 border-t border-line pt-3">
                                <div>
                                  <p className="text-xl font-bold text-navy">{formatPaise(o.basePricePaise)}</p>
                                  {extra > 0 ? <p className="text-xs text-muted">+ {formatPaise(extra)} taxes &amp; charges</p> : null}
                                </div>
                                {online ? (
                                  <Link href={`${p.path}/book?o=${o.id}`} className="btn btn-primary btn-sm">Book</Link>
                                ) : (
                                  <Link href={`${p.path}/enquire`} className="btn btn-secondary btn-sm" title="This service is not bookable online">Enquire</Link>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="p-4 text-sm text-muted md:px-5">Services and fees are not published for this area yet. Send an enquiry to ask.</p>
                    )}
                  </article>
                ))}
                <p className="text-sm text-muted">
                  Home visits and online sessions are arranged by enquiry and are not booked online. Fees are set by the practitioner.
                </p>
              </div>
            )}
          </Section>

          {/* How it works: describes the platform flow that actually applies to this profile. */}
          <section aria-labelledby="how-h" className="profile-how overflow-hidden rounded-[var(--r-card)] p-5 text-white md:p-6">
            <h2 id="how-h" className="t-section">{p.bookable ? "How booking works" : `How to see ${firstName}`}</h2>
            <ol className="mt-5 grid gap-4 sm:grid-cols-3">
              {steps.map(([t, d], i) => (
                <li key={t} className="rounded-[var(--r-panel)] bg-white/10 p-4 backdrop-blur-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal text-sm font-bold text-navy">{i + 1}</span>
                  <p className="mt-3 font-semibold">{t}</p>
                  <p className="mt-1 text-sm text-white/80">{d}</p>
                </li>
              ))}
            </ol>
            <Link href={ctaHref} className="btn mt-5 bg-white text-navy hover:bg-brand-soft">
              {ctaLabel}
            </Link>
          </section>

          <Section
            id="registrations"
            title="Registrations and verification"
            icon={<ShieldCheckIcon />}
            aside={<Link href="/help#verification" className="text-sm font-medium text-brand hover:underline">How verification works</Link>}
          >
            <p className="text-sm text-muted">{verification.explanation} Labels describe the check performed, not treatment quality.</p>
            {p.credentials.length ? (
              <ul className="mt-4 grid gap-3">
                {p.credentials.map((c, i) => {
                  const tone = credentialTone(c.status);
                  return (
                    <li key={i} className="flex gap-3 rounded-[var(--r-panel)] border border-line p-4">
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.badge}`}>
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
            <Section id="experience" title="Experience" icon={<BriefcaseIcon />} note="Roles are self-declared. Overlapping roles are not added together.">
              <ol className="relative grid gap-6 border-l-2 border-brand-soft pl-6">
                {p.experiences.map((e, i) => (
                  <li key={i} className="relative">
                    <span aria-hidden className={`absolute -left-[31px] top-1.5 h-3 w-3 rounded-full ring-4 ring-surface ${e.endMonth ? "bg-line-strong" : "bg-teal"}`} />
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
            <Section id="education" title="Education" icon={<CapIcon />}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {p.qualifications.map((q, i) => (
                  <li key={i} className="profile-lift flex gap-3 rounded-[var(--r-panel)] border border-line p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-ink">
                      <CapIcon />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold">{q.degree}</p>
                      <p className="text-sm text-muted">{q.institution}</p>
                      {q.inProgress || q.completionYear ? <p className="mt-1 text-xs font-medium text-brand">{q.inProgress ? "In progress" : q.completionYear}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section id="reviews" title="Appointment reviews" icon={<StarIcon />} note="Reviews come from completed platform appointments and are moderated. They do not verify clinical outcomes.">
            {p.reviews.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-[var(--r-panel)] border border-dashed border-line-strong bg-surface-2 px-4 py-8 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-mark-soft text-mark">
                  <StarIcon className="h-6 w-6" />
                </span>
                <p className="font-medium">No appointment reviews yet</p>
                <p className="max-w-sm text-sm text-muted">Only patients with a completed appointment can leave a review, so every review here is from a real visit.</p>
              </div>
            ) : (
              <ul className="grid gap-4">
                {p.reviews.map((r, i) => (
                  <li key={i} className="rounded-[var(--r-panel)] border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-soft text-sm font-semibold text-secondary">{r.displayName.slice(0, 1).toUpperCase()}</span>
                        <p className="font-medium">{r.displayName}</p>
                      </div>
                      <p className="flex items-center gap-1 text-sm text-muted">
                        <span className="sr-only">{r.rating} out of 5</span>
                        <span aria-hidden className="tracking-tight text-[#e0a100]">{"★".repeat(Math.round(r.rating))}<span className="text-line">{"★".repeat(5 - Math.round(r.rating))}</span></span>
                        · {formatDate(r.publishedAt)}
                      </p>
                    </div>
                    {r.text ? <p className="mt-3 text-sm leading-relaxed">{r.text}</p> : null}
                    {r.reply ? (
                      <div className="well mt-3 p-3 text-sm">
                        <p className="font-medium">Reply from {name}</p>
                        <p className="mt-1">{r.reply}</p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {p.portfolio.length ? (
            <Section id="achievements" title="Achievements and memberships" icon={<AwardIcon />}>
              <ul className="grid gap-4 sm:grid-cols-2">
                {p.portfolio.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-brand-ink">
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

          {articles.length ? (
            <Section id="articles" title={`Articles by ${firstName}`} icon={<DocIcon />} note="Written by this physiotherapist and read by our team before publication. General information, not personal medical advice.">
              <ul className="grid gap-3 sm:grid-cols-2">
                {articles.map((a) => (
                  <li key={a.id}>
                    <Link href={a.path} className="profile-lift card block h-full p-4">
                      <span className="block font-semibold text-navy">{a.title}</span>
                      {a.dek ? <span className="mt-1 block text-sm text-muted">{a.dek}</span> : null}
                      <span className="mt-2 block text-xs text-muted">{formatDate(a.publishedAt)}{a.readingMinutes ? ` · ${a.readingMinutes} min read` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section id="faq" title="Frequently asked questions" icon={<DocIcon />}>
            <div className="divide-y divide-line overflow-hidden rounded-[var(--r-panel)] border border-line">
              {faqs.map((f, i) => (
                <details key={f.q} className="group" open={i === 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 font-medium hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-brand transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="px-4 pb-4 text-sm leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </Section>

          {primaryBranch && localityHref && cityHref ? (
            <nav aria-label="Explore nearby" className="grid gap-3 sm:grid-cols-2">
              <Link href={localityHref} className="profile-lift card flex items-center justify-between gap-3 p-5">
                <span>
                  <span className="block text-xs font-medium text-muted">Explore</span>
                  <span className="font-semibold text-navy">More physiotherapists in {primaryBranch.localityName}</span>
                </span>
                <span aria-hidden className="text-xl text-brand">→</span>
              </Link>
              <Link href={cityHref} className="profile-lift card flex items-center justify-between gap-3 p-5">
                <span>
                  <span className="block text-xs font-medium text-muted">Explore</span>
                  <span className="font-semibold text-navy">All physiotherapists in {primaryBranch.cityName}</span>
                </span>
                <span aria-hidden className="text-xl text-brand">→</span>
              </Link>
            </nav>
          ) : null}

          <p className="flex flex-wrap gap-x-4 gap-y-2 px-1 text-sm text-muted">
            <Link href="/help#report" className="hover:underline">Report this profile</Link>
            <Link href="/help#correction" className="hover:underline">Request a correction</Link>
            {!p.claimed ? <Link href={`/claim/${p.publicId}`} className="hover:underline">Is this you? Claim this profile</Link> : null}
            <span>Profile ID {p.publicId}</span>
          </p>
        </div>

        {/* Booking rail (desktop). Sticky inside the grid, so it stops above the footer. Below lg the bottom bar carries the action. */}
        <aside className="hidden lg:sticky lg:top-40 lg:grid lg:gap-4" aria-label="Book an appointment">
          <div id="book" className="overflow-hidden rounded-[var(--r-card)] border border-line bg-surface" style={{ boxShadow: "var(--shadow-3)" }}>
            <div className="profile-rail-head px-6 pb-5 pt-6 text-white">
              <h2 className="t-card">{p.bookable ? "Book an appointment" : `Contact ${firstName}`}</h2>
              {minFee != null ? (
                <p className="mt-3">
                  <span className="text-sm text-white/80">From </span>
                  <span className="text-4xl font-bold">{formatPaise(minFee)}</span>
                  <span className="text-sm text-white/80"> / session</span>
                </p>
              ) : (
                <p className="mt-3 text-white/85">Fees on enquiry</p>
              )}
            </div>
            <div className="p-6 pt-5">
              {p.branches.length ? (
                <ul className="grid gap-2">
                  {p.branches.map((b) => {
                    const branchMin = b.offerings.length ? Math.min(...b.offerings.map((o) => o.basePricePaise)) : null;
                    return (
                      <li key={b.id} className="flex gap-3 rounded-[var(--r-ctl)] bg-surface-2 p-3 text-sm">
                        {b.kind === "service_area" ? <HomeIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> : <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />}
                        <div className="min-w-0">
                          <p className="font-medium">{b.kind === "service_area" ? `Home visits · ${b.localityName}` : b.name && b.name !== b.clinicName ? b.name : b.localityName}</p>
                          <p className="text-muted">
                            {b.offerings.length ? `${b.offerings.length} service${b.offerings.length === 1 ? "" : "s"}` : "Ask about services"}
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
                  <Link href={`${p.path}/book`} className="btn btn-primary profile-cta w-full">
                    <CalendarIcon /> Choose appointment
                  </Link>
                ) : (
                  <>
                    {/* Enquiry for unbookable profiles: not a booking, reserves nothing (Section 2) */}
                    <Link href={`${p.path}/enquire`} className="btn btn-primary profile-cta w-full">Send an enquiry</Link>
                    {phone ? (
                      <a href={`tel:${phone}`} className="btn btn-quiet w-full">
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
                <ul className="mt-5 grid gap-2 text-sm">
                  {["Free to enquire", `${firstName} calls you back`, "Nothing is booked until you agree"].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <CheckIcon className="h-4 w-4 text-success" /> {t}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <ShareButton title={`${name} — physiotherapist on The Physio Index`} className="btn btn-quiet w-full bg-surface" />
        </aside>
      </div>

      {/* Mobile booking bar: fee context + one action, safe-area padding; page reserves space beneath (PUB-07). */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden" style={{ boxShadow: "var(--shadow-3)" }}>
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-bold text-navy">{minFee != null ? <>From {formatPaise(minFee)}</> : "Fees on enquiry"}</p>
            <p className="truncate text-xs text-muted">{p.bookable ? "Instant confirmation" : "Free to enquire · nothing booked yet"}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {!p.bookable && phone ? (
              <a href={`tel:${phone}`} className="btn btn-quiet btn-sm" aria-label="Call clinic">
                <PhoneIcon />
              </a>
            ) : null}
            <Link href={ctaHref} className="btn btn-primary btn-sm profile-cta">
              {p.bookable ? "Book appointment" : "Enquire"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, note, aside, icon, children }: { id: string; title: string; note?: string; aside?: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="card scroll-mt-32 p-4 sm:p-5 md:scroll-mt-40 md:p-6" style={{ boxShadow: "var(--shadow-1)" }}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-h`} className="t-section flex items-center gap-3 text-navy">
          {icon ? <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-ink [&_svg]:h-5 [&_svg]:w-5">{icon}</span> : null}
          {title}
        </h2>
        {aside}
      </div>
      {children}
      {note ? <p className="mt-4 text-xs text-muted">{note}</p> : null}
    </section>
  );
}

function Tile({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="profile-lift flex min-w-0 gap-3 rounded-[var(--r-panel)] border border-line bg-surface-2/60 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-brand shadow-sm">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
        <dd className="mt-0.5 leading-tight">{children}</dd>
      </div>
    </div>
  );
}

function titleCase(s: string) {
  return s.replace(/(^|[\s.'-])(\p{L})/gu, (_, a: string, c: string) => a + c.toUpperCase());
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
