import type { Kind } from "./schemas";

/** Client-safe constants for the content editor (no database imports). */

/** Content editing is open to super_admin and, for now, verification_reviewer (IAM-01). */
export const CONTENT_EDITOR_ROLE = "verification_reviewer" as const;

export type ContentStatus = "draft" | "in_review" | "published" | "withdrawn" | "rejected";
export const STATUSES: ContentStatus[] = ["draft", "in_review", "published", "withdrawn", "rejected"];
export const STATUS_LABEL: Record<ContentStatus, string> = { draft: "Draft", in_review: "In review", published: "Published", withdrawn: "Withdrawn", rejected: "Rejected" };
export const KIND_LABEL_ADMIN: Record<Kind, { singular: string; plural: string }> = {
  blog: { singular: "Guide", plural: "Guides" },
  condition: { singular: "Condition page", plural: "Condition pages" },
  news: { singular: "News item", plural: "News" },
};

export type PractitionerOption = { id: string; displayName: string; where: string | null; listingStatus: string };
