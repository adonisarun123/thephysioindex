import type { PublicClinic, PublicProfile } from "./directory";
import { VERIFICATION_LABELS } from "./verification";

/**
 * JSON-LD matching visible content (SEO-03, SEO-04). A physiotherapist is a
 * Person with a physiotherapy occupation — never marked up as a Physician.
 * Clinics use schema.org's Physiotherapy (a MedicalBusiness).
 */
export function practitionerJsonLd(p: PublicProfile, siteUrl: string) {
  const url = new URL(p.path, siteUrl).toString();
  const person: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${url}#person`,
    url,
    name: p.displayName,
    jobTitle: p.designation ?? "Physiotherapist",
    description: p.headline ?? undefined,
    hasOccupation: { "@type": "Occupation", name: "Physiotherapist" },
    knowsLanguage: p.languages.map((l) => l.code),
    knowsAbout: p.specialties.map((s) => s.label),
    alumniOf: p.qualifications.map((q) => ({ "@type": "EducationalOrganization", name: q.institution })),
    hasCredential: p.qualifications.map((q) => ({
      "@type": "EducationalOccupationalCredential",
      credentialCategory: "degree",
      name: q.degree,
      recognizedBy: { "@type": "EducationalOrganization", name: q.institution },
    })),
    worksFor: p.branches.map((b) => ({
      "@type": "Physiotherapy",
      "@id": `${new URL(b.clinicPath, siteUrl).toString()}#branch-${b.id}`,
      name: b.clinicName,
      url: new URL(b.clinicPath, siteUrl).toString(),
      address: {
        "@type": "PostalAddress",
        streetAddress: [b.addressLine1, b.addressLine2].filter(Boolean).join(", "),
        addressLocality: `${b.localityName}, ${b.cityName}`,
        addressRegion: b.stateName,
        postalCode: b.pinCode,
        addressCountry: "IN",
      },
      ...(b.latitude != null && b.longitude != null ? { geo: { "@type": "GeoCoordinates", latitude: b.latitude, longitude: b.longitude } } : {}),
      ...(b.publicPhone ? { telephone: b.publicPhone } : {}),
    })),
  };
  // Only show rating data that is visible on the page (SEO-04).
  if (p.reviewCount > 0 && p.ratingAvgX100 != null) {
    person.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: (p.ratingAvgX100 / 100).toFixed(1),
      reviewCount: p.reviewCount,
      bestRating: 5,
      worstRating: 1,
    };
  }
  const checked = p.credentials.filter((c) => c.status === "registration_checked" && c.type === "statutory_registration");
  if (checked.length) {
    person.hasCredential = [
      ...(person.hasCredential as unknown[]),
      ...checked.map((c) => ({
        "@type": "EducationalOccupationalCredential",
        credentialCategory: "license",
        name: `${c.authorityName} registration (${VERIFICATION_LABELS.registration_checked.label})`,
        recognizedBy: { "@type": "Organization", name: c.authorityName },
        ...(c.publicNumber ? { identifier: c.publicNumber } : {}),
      })),
    ];
  }
  return person;
}

export function clinicJsonLd(c: PublicClinic, siteUrl: string) {
  const url = new URL(c.path, siteUrl).toString();
  return {
    "@context": "https://schema.org",
    "@type": "Physiotherapy",
    "@id": `${url}#clinic`,
    url,
    name: c.name,
    description: c.about ?? undefined,
    ...(c.website ? { sameAs: c.website } : {}),
    ...(c.publicPhone ? { telephone: c.publicPhone } : {}),
    department: c.branches.map((b) => ({
      "@type": "Physiotherapy",
      "@id": `${url}#branch-${b.id}`,
      name: `${c.name}, ${b.name}`,
      address: {
        "@type": "PostalAddress",
        streetAddress: [b.addressLine1, b.addressLine2].filter(Boolean).join(", "),
        addressLocality: `${b.localityName}, ${b.cityName}`,
        addressRegion: b.stateName,
        postalCode: b.pinCode,
        addressCountry: "IN",
      },
      ...(b.latitude != null && b.longitude != null ? { geo: { "@type": "GeoCoordinates", latitude: b.latitude, longitude: b.longitude } } : {}),
      ...(b.publicPhone ? { telephone: b.publicPhone } : {}),
      employee: b.practitioners.map((p) => ({
        "@type": "Person",
        name: p.displayName,
        jobTitle: p.designation ?? "Physiotherapist",
        url: new URL(`/physiotherapist/${p.slug}-${p.publicId}`, siteUrl).toString(),
      })),
    })),
  };
}
