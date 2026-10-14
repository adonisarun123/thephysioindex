import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ArticleBody, Byline, FaqList, RelatedList, SourcesList, Toc } from "@/components/content/article-parts";
import { ConditionSections, RedFlagBox } from "@/components/content/condition-sections";
import { PractitionerCardRow } from "@/components/practitioner-card";
import { conditionJsonLd, faqPageJsonLd } from "@/lib/content/jsonld";
import { renderMarkdown } from "@/lib/content/markdown";
import { getPublished, listRelated } from "@/lib/content/public";
import { searchPractitioners, type PractitionerCard } from "@/lib/directory";
import { indexDecision, robotsFor } from "@/lib/seo/gate";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

export async function generateMetadata({ params }: PageProps<"/conditions/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const a = await getPublished("condition", slug);
  if (!a) return { title: "Condition not found", robots: { index: false, follow: false } };
  const d = await indexDecision(a.path, { hasContent: !a.noindex });
  return {
    title: `${a.title}: symptoms, causes and how physiotherapy helps`,
    description: a.dek ?? renderMarkdown(a.bodyMarkdown).excerpt,
    alternates: { canonical: a.path },
    robots: robotsFor(d),
    openGraph: { type: "article", title: a.title, description: a.dek ?? undefined, url: a.path, publishedTime: a.publishedAt, modifiedTime: a.updatedAt },
  };
}

export default function Page({ params }: PageProps<"/conditions/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-8 text-muted">Loading…</div>}>
      <Condition params={params} />
    </Suspense>
  );
}

async function Condition({ params }: { params: PageProps<"/conditions/[slug]">["params"] }) {
  const { slug } = await params;
  await connection();
  const a = await getPublished("condition", slug);
  if (!a) notFound();
  const rendered = renderMarkdown(a.bodyMarkdown);
  const specialtySlug = a.specialty?.slug ?? null;
  const [related, practitioners] = await Promise.all([
    listRelated("condition", a.id, specialtySlug),
    specialtySlug ? searchPractitioners({ specialtySlug, limit: 6 }).then((r) => r.items).catch((): PractitionerCard[] => []) : Promise.resolve([] as PractitionerCard[]),
  ]);
  const findHref = specialtySlug ? `/physiotherapists?specialty=${encodeURIComponent(specialtySlug)}` : "/physiotherapists";
  const crumbs = [{ label: "Home", href: "/" }, { label: "Conditions", href: "/conditions" }, { label: a.title }];
  const ld = [conditionJsonLd(a, siteUrl, rendered.excerpt), faqPageJsonLd(a, siteUrl)].filter(Boolean);
  const toc = [
    ...(a.condition && Object.values(a.condition).some((v) => Array.isArray(v) && v.length) ? [{ id: "overview", text: "At a glance", depth: 2 as const }] : []),
    ...rendered.toc,
    ...(a.faqs.length ? [{ id: "faqs", text: "Frequently asked questions", depth: 2 as const }] : []),
    { id: "find", text: "Find a physiotherapist", depth: 2 as const },
  ];

  return (
    <article className="mx-auto max-w-6xl px-4 py-6 lg:py-10">
      {ld.map((o, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(o) }} />)}
      <Breadcrumbs siteUrl={siteUrl} items={crumbs} />
      <header className="mt-5 max-w-3xl">
        {a.specialty ? <span className="pill bg-brand-soft text-brand-ink">{a.specialty.label}</span> : null}
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{a.title}</h1>
        {a.condition?.alsoKnownAs?.length ? <p className="mt-2 text-sm text-muted">Also known as: {a.condition.alsoKnownAs.join(", ")}</p> : null}
        {a.dek ? <p className="mt-3 text-lg text-ink-2">{a.dek}</p> : null}
        <Byline a={a} />
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_17rem]">
        <div className="min-w-0 max-w-3xl">
          <RedFlagBox flags={a.condition?.redFlags ?? []} />
          <ConditionSections meta={a.condition} />
          <ArticleBody html={rendered.html} />
          <FaqList faqs={a.faqs} />

          <section id="find" className="mt-10 scroll-mt-6">
            <h2 className="text-2xl font-semibold">Find a physiotherapist for this</h2>
            <p className="mt-2 text-muted">
              {a.specialty
                ? `Published profiles listing ${a.specialty.label.toLowerCase()} as an area of practice. Listings show the checks performed, not treatment quality.`
                : "Browse published physiotherapist profiles by state, city and locality."}
            </p>
            {practitioners.length ? (
              <ul className="mt-2">
                {practitioners.map((c) => <PractitionerCardRow key={c.id} card={c} />)}
              </ul>
            ) : a.specialty ? (
              <p className="mt-3 text-sm text-muted">No published profiles list this specialty yet. Browse by location instead.</p>
            ) : null}
            <Link href={findHref} className="btn btn-primary mt-5">{a.specialty ? `See all ${a.specialty.label.toLowerCase()} physiotherapists` : "Find a physiotherapist"}</Link>
          </section>

          <SourcesList sources={a.sources} />
          <p className="mt-8 text-xs text-muted">
            This page is general information for patients in India and does not diagnose or prescribe. It does not replace an assessment by a qualified physiotherapist or doctor.
          </p>
        </div>
        <aside className="order-first lg:order-none lg:sticky lg:top-4 lg:self-start">
          <Toc entries={toc} />
          <div className="card mt-4 p-4 text-sm">
            <p className="font-semibold">Need hands-on help?</p>
            <p className="mt-1 text-muted">Compare qualifications, registrations and fees before you book.</p>
            <Link href={findHref} className="btn btn-secondary mt-3 w-full py-2">Find a physiotherapist</Link>
            {/* LOC-04, BKG-06: home visits are enquiry-only in R1, so offer that path explicitly. */}
            <Link href="/physiotherapists?specialty=home-based-rehabilitation" className="btn btn-quiet btn-sm mt-2 w-full">Prefer a home visit?</Link>
          </div>
        </aside>
      </div>
      <RelatedList title="Related conditions" items={related} />
    </article>
  );
}
