import type { NavGroup } from "@/components/admin/admin-shell";

export type QueueCounts = Record<string, number>;

/** Sidebar definition. Counts come from one SQL round trip (see queues.ts). */
export function adminNav(c: QueueCounts): NavGroup[] {
  return [
    {
      label: "Overview",
      items: [
        { href: "/admin", label: "Overview" },
        { href: "/admin/bookings", label: "Bookings", count: c.bookings_today },
      ],
    },
    {
      label: "Review queues",
      items: [
        { href: "/admin/queues/listing_review", label: "New listings", count: c.listing_review },
        { href: "/admin/queues/profile_change", label: "Profile changes", count: c.profile_change },
        { href: "/admin/queues/claim", label: "Claims", count: c.claim },
        { href: "/admin/queues/credential_check", label: "Credential checks", count: c.credential_check },
        { href: "/admin/queues/duplicate_candidate", label: "Duplicates", count: c.duplicate_candidate },
        { href: "/admin/queues/offer_review", label: "Offers", count: c.offer_review },
        { href: "/admin/queues/review_moderation", label: "Reviews", count: c.review_moderation },
        { href: "/admin/queues/complaint", label: "Complaints", count: c.complaint },
        { href: "/admin/queues/correction_request", label: "Corrections", count: c.correction_request },
        { href: "/admin/queues/locality_proposal", label: "Locality proposals", count: c.locality_proposal },
        { href: "/admin/enquiries", label: "Enquiries", count: c.enquiries },
        { href: "/admin/support", label: "Support cases", count: c.support },
      ],
    },
    {
      label: "Directory",
      items: [
        { href: "/admin/practitioners", label: "Practitioners" },
        { href: "/admin/signups", label: "Sign-up leads", count: c.signups },
        { href: "/admin/clinics", label: "Clinics" },
        { href: "/admin/patients", label: "Patients" },
        { href: "/admin/imports", label: "Imports" },
      ],
    },
    {
      label: "Content",
      items: [
        { href: "/admin/content/blog", label: "Blog", count: c.content_blog },
        { href: "/admin/content/condition", label: "Conditions", count: c.content_condition },
        { href: "/admin/content/news", label: "News", count: c.content_news },
        { href: "/admin/seo", label: "SEO" },
      ],
    },
    {
      label: "Master data",
      items: [
        { href: "/admin/geography", label: "Geography" },
        { href: "/admin/taxonomy", label: "Specialties and services" },
        { href: "/admin/authorities", label: "Credential authorities" },
        { href: "/admin/policies", label: "Policies and templates" },
        { href: "/admin/config", label: "Configuration and flags", superOnly: true },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/admin/notifications", label: "Notifications", count: c.notifications_dead },
        { href: "/admin/analytics", label: "Analytics" },
        { href: "/admin/audit", label: "Audit log" },
        { href: "/admin/staff", label: "Staff and roles", superOnly: true },
        { href: "/admin/privacy", label: "Privacy requests", count: c.privacy },
      ],
    },
  ];
}
