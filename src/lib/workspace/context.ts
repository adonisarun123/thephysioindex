import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db/client";
import { ApiError } from "@/lib/api";
import { canManagePractitioner, getViewer, type Viewer } from "@/lib/auth/session";

/**
 * Workspace context (Section 15, IAM-01). The practitioner a viewer works on
 * is resolved server-side from ownership or an explicit role grant scoped to
 * that practitioner; it is never taken from the request body.
 */

export type WorkspacePractitioner = {
  id: string;
  publicId: string;
  slug: string;
  displayName: string;
  designation: string | null;
  headline: string | null;
  listingStatus: string;
  claimState: string;
  bookingEligible: boolean;
  bookingPaused: boolean;
  publishedVersionId: string | null;
  ownerUserId: string | null;
  isOwner: boolean;
};

type Row = {
  id: string;
  public_id: string;
  slug: string;
  display_name: string;
  designation: string | null;
  headline: string | null;
  listing_status: string;
  claim_state: string;
  booking_eligible: boolean;
  booking_paused: boolean;
  published_version_id: string | null;
  owner_user_id: string | null;
};

function toPractitioner(r: Row, viewerId: string): WorkspacePractitioner {
  return {
    id: r.id,
    publicId: r.public_id,
    slug: r.slug,
    displayName: r.display_name,
    designation: r.designation,
    headline: r.headline,
    listingStatus: r.listing_status,
    claimState: r.claim_state,
    bookingEligible: r.booking_eligible,
    bookingPaused: r.booking_paused,
    publishedVersionId: r.published_version_id,
    ownerUserId: r.owner_user_id,
    isOwner: r.owner_user_id === viewerId,
  };
}

const COLUMNS = sql`id, public_id, slug, display_name, designation, headline, listing_status::text AS listing_status, claim_state::text AS claim_state,
  booking_eligible, booking_paused, published_version_id, owner_user_id`;

/** Owned practitioner first; otherwise the first practitioner-scoped coordinator grant. Cached per request. */
export const resolveWorkspacePractitioner = cache(async (viewer: Viewer): Promise<WorkspacePractitioner | null> => {
  const owned = await db().execute<Row>(sql`SELECT ${COLUMNS} FROM practitioners WHERE owner_user_id = ${viewer.userId} AND listing_status <> 'archived' ORDER BY created_at LIMIT 1`);
  if (owned.rows[0]) return toPractitioner(owned.rows[0], viewer.userId);
  const scoped = viewer.grants.filter((g) => g.scopeType === "practitioner" && g.scopeId && ["clinic_coordinator", "clinic_manager", "clinic_owner"].includes(g.role)).map((g) => g.scopeId!);
  if (scoped.length === 0) return null;
  const granted = await db().execute<Row>(sql`SELECT ${COLUMNS} FROM practitioners WHERE id = ANY(${scoped}::uuid[]) ORDER BY created_at LIMIT 1`);
  return granted.rows[0] ? toPractitioner(granted.rows[0], viewer.userId) : null;
});

/** Pages: signed-in practitioner-side viewer with a practitioner, else onboarding. */
export async function requireWorkspace(next: string): Promise<{ viewer: Viewer; practitioner: WorkspacePractitioner }> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?as=practitioner&next=${encodeURIComponent(next)}`);
  const practitioner = await resolveWorkspacePractitioner(viewer);
  if (!practitioner) redirect("/workspace/onboarding");
  return { viewer, practitioner };
}

/** Server actions: resolve the viewer's practitioner and confirm management rights (IAM-01). Throws catalogue errors. */
export async function requireManage(): Promise<{ viewer: Viewer; practitioner: WorkspacePractitioner }> {
  const viewer = await getViewer();
  if (!viewer) throw new ApiError("UNAUTHENTICATED", "Sign in to continue");
  const practitioner = await resolveWorkspacePractitioner(viewer);
  if (!practitioner) throw new ApiError("NOT_FOUND", "No practitioner profile is linked to this account");
  if (!(await canManagePractitioner(viewer, practitioner.id))) throw new ApiError("UNAUTHORISED", "You cannot manage this profile");
  return { viewer, practitioner };
}

/** Owner-only actions (consents, closure, team changes). Coordinators are refused. */
export async function requireOwner(): Promise<{ viewer: Viewer; practitioner: WorkspacePractitioner }> {
  const ctx = await requireManage();
  if (!ctx.practitioner.isOwner && !ctx.viewer.grants.some((g) => g.role === "super_admin")) {
    throw new ApiError("UNAUTHORISED", "Only the profile owner can do this");
  }
  return ctx;
}
