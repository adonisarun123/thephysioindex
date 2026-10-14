import type { PublicArticle } from "./public";

/**
 * JSON-LD for editorial pages (SEO-03, SEO-04). Every property here mirrors
 * something visible on the page: reviewer attribution appears only when the
 * reviewer fields are set, dates match the dateline, FAQs match the rendered
 * list. Articles are never marked up as medical advice from a physician.
 */

function org(siteUrl: string) {
  return { "@type": "Organization", name: "The Physio Index", url: siteUrl, logo: { "@type": "ImageObject", url: `${siteUrl}/brand/tpi-logo.png` } };
}

function author(a: PublicArticle, siteUrl: string) {
  if (a.authorPractitioner) {
    return { "@type": "Person", name: a.authorPractitioner.displayName, url: new URL(a.authorPractitioner.path, siteUrl).toString(), hasOccupation: { "@type": "Occupation", name: "Physiotherapist" } };
  }
  if (a.authorName) return { "@type": "Person", name: a.authorName };
  return org(siteUrl);
}

function reviewer(a: PublicArticle) {
  if (!a.reviewerName || !a.reviewerCredential || !a.reviewedAt) return {};
  return {
    reviewedBy: { "@type": "Person", name: a.reviewerName, honorificSuffix: a.reviewerCredential, hasOccupation: { "@type": "Occupation", name: "Physiotherapist" } },
    lastReviewed: a.reviewedAt.slice(0, 10),
  };
}

export function faqPageJsonLd(a: PublicArticle, siteUrl: string) {
  if (!a.faqs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${new URL(a.path, siteUrl)}#faq`,
    mainEntity: a.faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
  };
}

export function blogPostingJsonLd(a: PublicArticle, siteUrl: string, excerpt: string, wordCount: number) {
  const url = new URL(a.path, siteUrl).toString();
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    mainEntityOfPage: url,
    url,
    headline: a.title,
    description: a.dek ?? excerpt,
    datePublished: a.publishedAt,
    dateModified: a.updatedAt,
    author: author(a, siteUrl),
    publisher: org(siteUrl),
    keywords: a.tags.length ? a.tags.join(", ") : undefined,
    about: a.specialty ? { "@type": "Thing", name: a.specialty.label } : undefined,
    wordCount,
    inLanguage: "en-IN",
    isAccessibleForFree: true,
    ...reviewer(a),
  };
}

export function newsArticleJsonLd(a: PublicArticle, siteUrl: string, excerpt: string) {
  const url = new URL(a.path, siteUrl).toString();
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${url}#article`,
    mainEntityOfPage: url,
    url,
    headline: a.title,
    description: a.dek ?? excerpt,
    datePublished: a.publishedAt,
    dateModified: a.updatedAt,
    articleSection: a.newsCategory ?? undefined,
    author: author(a, siteUrl),
    publisher: org(siteUrl),
    inLanguage: "en-IN",
    isAccessibleForFree: true,
    citation: a.sources.length ? a.sources.map((s) => ({ "@type": "CreativeWork", name: s.title, url: s.url })) : undefined,
    ...(a.correction
      ? { correction: { "@type": "CorrectionComment", text: a.correction, datePublished: a.correctedAt ?? a.updatedAt } }
      : {}),
  };
}

export function conditionJsonLd(a: PublicArticle, siteUrl: string, excerpt: string) {
  const url = new URL(a.path, siteUrl).toString();
  const c = a.condition ?? {};
  const condition = {
    "@type": "MedicalCondition",
    "@id": `${url}#condition`,
    name: a.title,
    alternateName: c.alsoKnownAs?.length ? c.alsoKnownAs : undefined,
    description: a.dek ?? excerpt,
    signOrSymptom: c.symptoms?.map((s) => ({ "@type": "MedicalSignOrSymptom", name: s })),
    possibleTreatment: c.physiotherapyHelps?.length ? { "@type": "PhysicalTherapy", name: "Physiotherapy", description: c.physiotherapyHelps.join(" ") } : undefined,
    associatedAnatomy: c.bodyArea ? { "@type": "AnatomicalStructure", name: c.bodyArea } : undefined,
  };
  const page = {
    "@type": "MedicalWebPage",
    "@id": `${url}#page`,
    url,
    name: a.title,
    description: a.dek ?? excerpt,
    about: { "@id": `${url}#condition` },
    datePublished: a.publishedAt,
    dateModified: a.updatedAt,
    author: author(a, siteUrl),
    publisher: org(siteUrl),
    audience: { "@type": "MedicalAudience", audienceType: "Patient" },
    inLanguage: "en-IN",
    medicalAudience: { "@type": "MedicalAudience", audienceType: "Patient" },
    ...reviewer(a),
  };
  return { "@context": "https://schema.org", "@graph": [condition, page] };
}
