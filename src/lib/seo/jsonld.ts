/**
 * Site-level structured data (SEO-03, SEO-04). Every property mirrors
 * something visible on the page it is emitted on; nothing here states a
 * rating, count or claim the page does not show (DIR-14).
 */

export const SITE_NAME = "The Physio Index";
export const SITE_DESCRIPTION =
  "India-wide physiotherapist directory. Compare qualifications, registrations, fees and availability by state, city and locality, then book an appointment.";

/** Fallback share image (src/app/opengraph-image.tsx) for pages whose own `openGraph` would otherwise drop it. */
export const DEFAULT_OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "The Physio Index — find and book physiotherapists across India" };

export function organizationJsonLd(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: SITE_NAME,
    url: siteUrl,
    logo: { "@type": "ImageObject", url: `${siteUrl}/brand/tpi-logo.png` },
    description: SITE_DESCRIPTION,
    areaServed: { "@type": "Country", name: "India" },
  };
}

export function websiteJsonLd(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: siteUrl,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: "en-IN",
    publisher: { "@id": `${siteUrl}/#organization` },
    // The directory search form on the home page submits to this URL (PUB-01).
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/physiotherapists?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** Ordered list of the profiles shown on a directory page, in the order shown. */
export function practitionerItemListJsonLd(opts: { siteUrl: string; pagePath: string; name: string; total: number; items: { path: string; displayName: string }[] }) {
  const url = new URL(opts.pagePath, opts.siteUrl).toString();
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${url}#results`,
    name: opts.name,
    numberOfItems: opts.total,
    itemListElement: opts.items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.displayName,
      url: new URL(it.path, opts.siteUrl).toString(),
    })),
  };
}

/** FAQPage for question/answer pairs rendered as plain text on the page. */
export function faqPageJsonLd(pageUrl: string, faqs: { question: string; answer: string }[]) {
  if (!faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };
}

/** JSON for a <script type="application/ld+json"> tag; "<" is escaped so user text cannot close the tag. */
export function ldJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
