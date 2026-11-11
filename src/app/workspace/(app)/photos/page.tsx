import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { PatientPhotoUploader } from "@/components/workspace/patient-photo-uploader";
import { imageKitEnabled } from "@/lib/media/imagekit";
import { listOwnPhotos, MAX_GALLERY_PHOTOS, PRACTITIONER_CONSENT_STATEMENT } from "@/lib/treatment-photos";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { removePatientPhotoAction } from "./actions";

export const metadata: Metadata = { title: "Patient photos" };

export default function Page({ searchParams }: PageProps<"/workspace/photos">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Photos searchParams={searchParams} />
    </Suspense>
  );
}

/** Photos of patients for the public profile: uploaded with a recorded consent declaration, public only after moderation. */
async function Photos({ searchParams }: { searchParams: PageProps<"/workspace/photos">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace/photos");
  const photos = await listOwnPhotos(p.id);
  const live = photos.filter((x) => x.state !== "rejected").length;
  const msg = readMessage(sp);
  const published = p.listingStatus === "published";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Patient photos"
        lede={`Show up to ${MAX_GALLERY_PHOTOS} photos of patients you have treated. Each photo needs the patient's written consent and is checked by our team before it appears on your profile.`}
      />
      <Notice ok={msg.ok} error={msg.error} />
      <Section title="Add a photo" lede="Good photos show an adult patient during an exercise or treatment session, fully clothed, in your clinic or at home. Not accepted: children, wounds, scans or reports, before-and-after comparisons, or anything the patient has not agreed to in writing.">
        <PatientPhotoUploader
          enabled={imageKitEnabled() && published}
          disabledReason={!published ? "You can add patient photos once your profile is approved and published." : "Photo upload is being switched on. Check back soon."}
          consentStatement={PRACTITIONER_CONSENT_STATEMENT}
          remaining={MAX_GALLERY_PHOTOS - live}
        />
      </Section>
      <Section title={photos.length ? `Your photos (${photos.length})` : "No photos yet"} lede="Remove a photo at any time, for example if the patient changes their mind. Removal is immediate and permanent.">
        {photos.length === 0 ? (
          <Empty>Ask one or two patients who have done well whether they would be happy to appear on your profile, and get their agreement in writing first.</Empty>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {photos.map((ph) => (
              <li key={ph.id} className="rounded-[var(--r-sm)] border border-line p-3 text-sm">
                {ph.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ImageKit serves the sized variant
                  <img src={ph.url} alt={ph.caption ?? "Patient photo"} loading="lazy" className="h-48 w-full rounded-[var(--r-sm)] object-cover" />
                ) : null}
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2"><StatePill state={ph.state === "approved" ? "published" : ph.state} /></p>
                    {ph.caption ? <p className="mt-1">{ph.caption}</p> : null}
                    {ph.state === "pending" ? <p className="mt-1 text-xs text-muted">With our team. Not on your profile yet.</p> : null}
                    {ph.state === "rejected" && ph.moderationReason ? <p className="mt-1 text-xs text-muted">Not used: {ph.moderationReason}</p> : null}
                  </div>
                  <form action={removePatientPhotoAction}>
                    <input type="hidden" name="photoId" value={ph.id} />
                    <button type="submit" className="btn btn-quiet py-1.5 text-sm">Remove</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
