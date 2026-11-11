# Profile photos (ImageKit)

Practitioner profile photos are stored and served by ImageKit (PRO-12; owner request 11 Nov 2026).
Patient documents, certificates and identity proof are **not** here: they stay in the private Vercel Blob store (`docs/runbooks/patient-documents.md`).

## Switch it on

Set in Vercel (Production and Preview), then redeploy:

| Variable | Where to find it |
| --- | --- |
| `IMAGEKIT_PUBLIC_KEY` | ImageKit dashboard → Developer options → API keys |
| `IMAGEKIT_PRIVATE_KEY` | same page. Server only; mark Sensitive |
| `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` | same page, "URL-endpoint", e.g. `https://ik.imagekit.io/<id>` |

Until all three are set, the upload box says "being switched on" and the photo is **not** part of the 100% checklist, so nobody is blocked. Once set, "Profile photo" becomes a required checklist item (SRS PRO-08 lists a photograph under required identity fields).

In ImageKit settings, leave "Preserve image metadata" **off** so delivered images carry no EXIF/GPS.

## Flow

1. `/workspace/onboarding` (Finish your profile) and `/workspace/profile` show the photo box. The practitioner ticks "This is a photo of me…" and picks or takes a photo.
2. The browser shrinks it to ≤1200 px JPEG and uploads directly to ImageKit with a 10-minute signature from `photoUploadAuthAction`, into `/<prod|test>/practitioners/<publicId>/profile/`. ImageKit re-encodes it on upload (`w-1200,h-1200,c-at_max,q-85`).
3. `savePhotoAction` re-reads the file from the ImageKit API and checks folder, type, size (≤5 MB) and dimensions (≥200 px) before writing a `media_assets` row (`purpose profile_photo`, `visibility public`, `moderation_state pending`, `external_id` = ImageKit fileId). Earlier pending uploads are soft-deleted and removed from ImageKit.
4. A pending photo counts for completion but is never public.
5. Approving the listing review or profile change publishes it (`practitioners.photo_asset_id`). Reviewers can also approve or reject it on Admin → Practitioner → Profile photo. The photo is shown on listing-review cases.
6. Public profile, directory cards, JSON-LD `image` and Open Graph use only the approved photo.

## Known gaps

- A published practitioner who uploads a new photo without submitting a profile change has nothing in a queue: a reviewer must approve it from the practitioner page.
- Previews and production share one ImageKit account; test uploads go under `/test/`.
- Clinic photos (`clinic_photo`) can reuse `practitionerFolder(…, "clinic_photo")`; no UI yet.
