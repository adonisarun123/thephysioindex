import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Hidden, Notice, Tabs } from "@/components/admin/ui";
import { fmtDateTime, type SP } from "@/lib/admin/format";
import { requireStaff } from "@/lib/auth/session";
import { listPhotosForModeration, pendingPhotoCount, type AdminPhoto } from "@/lib/treatment-photos";
import { decidePhotoAction, removePhotoAction } from "../actions/photos";

export default function Page({ searchParams }: PageProps<"/admin/photos">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading photos…</p>}>
      <Photos searchParams={searchParams} />
    </Suspense>
  );
}

/** Moderation of photographs of patients. Nothing here is public until approved; anything live can be taken down. */
async function Photos({ searchParams }: { searchParams: PageProps<"/admin/photos">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff("verification_reviewer");
  const view = sp.view === "live" ? "live" : "pending";
  const [photos, pending] = await Promise.all([listPhotosForModeration(view), pendingPhotoCount()]);
  return (
    <>
      <PageHeader
        title="Patient photos"
        description="Photos of patients that physiotherapists want on their profiles. Approve only clear, respectful photos of an adult in a clinic or exercise setting. Reject anything showing a child, undress, a wound or scan, a face in distress, a readable document, or before-and-after claims."
      />
      <Notice sp={sp} />
      <Tabs current={view === "live" ? "Live" : "Waiting"} items={[{ href: "/admin/photos", label: "Waiting", count: pending }, { href: "/admin/photos?view=live", label: "Live" }]} />
      {photos.length === 0 ? (
        <Empty>{view === "pending" ? "No photos waiting." : "No photos are live."}</Empty>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {photos.map((p) => (
            <PhotoCard key={p.id} p={p} view={view} />
          ))}
        </ul>
      )}
    </>
  );
}

function PhotoCard({ p, view }: { p: AdminPhoto; view: "pending" | "live" }) {
  return (
    <li className="card grid gap-3 p-4 text-sm">
      {p.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- ImageKit serves the sized variant
        <img src={p.url} alt={p.caption ?? "Patient photo awaiting moderation"} className="max-h-80 w-full rounded-[var(--r-sm)] border border-line object-contain" />
      ) : (
        <p className="rounded-[var(--r-sm)] border border-dashed border-line-strong p-4 text-muted">The image service is not configured, so the photo cannot be shown.</p>
      )}
      <div>
        <p className="font-medium">
          <Link href={`/admin/practitioners/${p.practitionerId}`} className="underline">{p.practitionerName}</Link>
          <span className="ml-2 font-normal text-muted">{p.kind === "review" ? "attached by a patient to their review" : "uploaded by the physiotherapist"}</span>
        </p>
        {p.caption ? <p className="mt-1">Caption: {p.caption}</p> : null}
        <p className="mt-2 text-xs text-muted">
          Consent ({p.consentBasis === "patient_own" ? "the patient's own" : "declared by the physiotherapist"}), {fmtDateTime(p.consentAt)}, {p.uploaderEmail ?? "account without email"}:
        </p>
        <blockquote className="mt-1 rounded-[var(--r-sm)] bg-surface-2 p-2 text-xs">{p.consentStatement}</blockquote>
      </div>
      {view === "pending" ? (
        <div className="grid gap-2">
          <form action={decidePhotoAction}>
            <Hidden name="photoId" value={p.id} />
            <Hidden name="decision" value="approve" />
            <button type="submit" className="btn btn-primary py-2">Approve and publish</button>
          </form>
          <form action={decidePhotoAction} className="flex flex-wrap gap-2">
            <Hidden name="photoId" value={p.id} />
            <Hidden name="decision" value="reject" />
            <input name="reason" className="input min-w-0 flex-1 py-1.5" placeholder="Reason the physiotherapist will see" required minLength={5} maxLength={500} aria-label="Reason for rejecting" />
            <button type="submit" className="btn btn-quiet py-1.5">Reject</button>
          </form>
        </div>
      ) : (
        <form action={removePhotoAction} className="flex flex-wrap gap-2">
          <Hidden name="photoId" value={p.id} />
          <input name="reason" className="input min-w-0 flex-1 py-1.5" placeholder="Why it is being removed (kept in the audit log)" required minLength={5} maxLength={500} aria-label="Reason for removing" />
          <button type="submit" className="btn btn-quiet py-1.5">Remove for good</button>
        </form>
      )}
    </li>
  );
}
