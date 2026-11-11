import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CompletionMeter } from "@/components/workspace/completion-meter";
import { Notice } from "@/components/workspace/forms/ui";
import { PhotoUploader } from "@/components/workspace/photo-uploader";
import { imageKitEnabled } from "@/lib/media/imagekit";
import { photoState } from "@/lib/workspace/photo";
import { getViewer } from "@/lib/auth/session";
import { listAuthorityOptions, listLanguageOptions, listServiceOptions, listSpecialtyOptions } from "@/lib/workspace/catalog";
import { WEEKDAYS } from "@/lib/workspace/calendar";
import { ABOUT_MIN_CHARS, completionPercent, profileChecklist } from "@/lib/workspace/completion";
import { resolveWorkspacePractitioner } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { onboardingStatus } from "@/lib/workspace/onboarding";
import { listAssociations } from "@/lib/workspace/queries";
import { DEGREES } from "@/lib/workspace/registration-options";
import { finishProfileAction } from "./actions";

export const metadata: Metadata = { title: "Finish your profile", robots: { index: false, follow: false } };

/**
 * One-screen profile completion (PRO-03; owner decision 8 Nov 2026: the whole
 * onboarding in under two minutes). Shows only what the 100% checklist still
 * needs, pre-filled with sensible defaults, and submits for verification in
 * the same click. Lives outside the workspace shell so it reads as one task.
 */
export default function Page({ searchParams }: PageProps<"/workspace/onboarding">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-12 text-muted">Loading…</div>}>
      <Finish searchParams={searchParams} />
    </Suspense>
  );
}

async function Finish({ searchParams }: { searchParams: PageProps<"/workspace/onboarding">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const viewer = await getViewer();
  // Google Ads lands here (owner decision 8 Nov 2026). Visitors without a
  // session are new prospects: send them to registration, keeping gclid/utm
  // so the sign-up conversion on /join/thank-you is still attributed.
  if (!viewer) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") qs.set(k, v);
    redirect(`/for-physiotherapists/join${qs.size ? `?${qs}` : ""}`);
  }
  const practitioner = await resolveWorkspacePractitioner(viewer);
  if (!practitioner) redirect("/for-physiotherapists/join#register");

  const status = await onboardingStatus(practitioner.id);
  const items = profileChecklist(status.draft, status);
  const open = new Set(items.filter((i) => !i.done).map((i) => i.key));
  const msg = readMessage(sp);
  const awaitingReview = status.versionState !== "draft" && status.versionState !== null;

  const [specialties, languages, services, authorities, associations, photo] = await Promise.all([
    open.has("specialty") ? listSpecialtyOptions() : Promise.resolve([]),
    open.has("languages") ? listLanguageOptions() : Promise.resolve([]),
    open.has("services") ? listServiceOptions() : Promise.resolve([]),
    open.has("registration") ? listAuthorityOptions() : Promise.resolve([]),
    listAssociations(practitioner.id),
    photoState(practitioner.id),
  ]);
  const live = associations.filter((a) => a.state !== "ended" && a.state !== "rejected");
  const place = live[0] ? (live[0].kind === "service_area" ? `offering home visits in ${live[0].localityName}, ${live[0].cityName}` : `at ${live[0].clinicName}, ${live[0].localityName}, ${live[0].cityName}`) : "";
  const name = status.draft.identity?.displayName ?? practitioner.displayName;
  const degree = status.draft.qualifications?.[0]?.degree;
  const aboutStarter =
    status.draft.about?.trim() ||
    `I am ${name}${degree ? `, a ${degree}` : ", a"} physiotherapist${place ? ` ${place}` : ""}. I assess each patient carefully, explain what is causing the problem, and build a clear treatment and home exercise plan to get them moving again.`;
  const english = languages.find((l) => l.label.toLowerCase() === "english");
  const chosenLanguages = new Set(status.draft.languages?.length ? status.draft.languages : english ? [english.id] : []);
  const defaultService = services.find((s) => s.kind === "initial_assessment") ?? services[0];

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Finish your profile</h1>
          <Link href="/workspace" className="text-sm underline">Skip to workspace</Link>
        </div>
        <p className="mt-1 text-muted">One screen, about a minute. We have filled in sensible defaults: check them, add your fee, and submit.</p>
        <Notice {...msg} />

        <div className="card mt-6 p-5"><CompletionMeter items={items} compact submitted={awaitingReview} /></div>

        {awaitingReview ? (
          <div className="card mt-6 p-5">
            <p className="font-medium">{awaitingReview ? "Your profile is with our team for verification." : "Your profile is complete."}</p>
            <p className="mt-1 text-sm text-muted">{awaitingReview ? "We check your registration and email you once it is live." : "Submit it from your workspace."}</p>
            <Link href="/workspace" className="btn btn-primary mt-4">Go to workspace</Link>
          </div>
        ) : (
          <form action={finishProfileAction} className="card mt-6 grid gap-6 p-5">
            {/* Always shown (not only when open) so the form keeps its typed values when the page refreshes after an upload. */}
            {imageKitEnabled() ? <PhotoUploader compact displayName={name} publishedUrl={photo.published?.url ?? null} pending={photo.pending} enabled /> : null}
            {open.has("basics") ? (
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-2 font-semibold">Qualification</legend>
                <select name="degree" className="input" required defaultValue="">
                  <option value="" disabled>Choose one</option>
                  {DEGREES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <input name="institution" className="input" required minLength={2} maxLength={160} placeholder="College or university" aria-label="College or university" />
              </fieldset>
            ) : null}

            {open.has("registration") ? (
              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="mb-2 font-semibold">Registration</legend>
                <select name="authorityId" className="input" required defaultValue="" aria-label="Registered with">
                  <option value="" disabled>State council or IAP</option>
                  {authorities.map((a) => <option key={a.id} value={a.id}>{a.label}{a.jurisdiction ? ` — ${a.jurisdiction}` : ""}</option>)}
                </select>
                <input name="registrationNumber" className="input" required minLength={2} maxLength={60} placeholder="Registration number" aria-label="Registration number" />
              </fieldset>
            ) : null}

            {open.has("about") ? (
              <div>
                <label className="label" htmlFor="about">About you</label>
                <textarea id="about" name="about" className="input min-h-28" required minLength={ABOUT_MIN_CHARS} maxLength={3000} defaultValue={aboutStarter} />
                <p className="mt-1 text-xs text-muted">A starting draft. Edit it to sound like you (at least {ABOUT_MIN_CHARS} characters).</p>
              </div>
            ) : null}

            {open.has("specialty") || open.has("languages") ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {open.has("specialty") ? (
                  <div>
                    <label className="label" htmlFor="primarySpecialtyId">Main area of practice</label>
                    <select id="primarySpecialtyId" name="primarySpecialtyId" className="input" required defaultValue="">
                      <option value="" disabled>Choose one</option>
                      {specialties.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                ) : null}
                {open.has("languages") ? (
                  <fieldset>
                    <legend className="label">Languages you consult in</legend>
                    <input type="hidden" name="languagesShown" value="1" />
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {languages.map((l) => (
                        <label key={l.id} className="flex items-center gap-1.5">
                          <input type="checkbox" name="languageIds" value={l.id} defaultChecked={chosenLanguages.has(l.id)} />
                          {l.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
              </div>
            ) : null}

            {open.has("specialty") ? (
              <fieldset>
                <legend className="label">Other areas you treat <span className="font-normal text-muted">(optional, tick any)</span></legend>
                <div className="mt-1 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  {specialties.map((s) => (
                    <label key={s.id} className="flex items-center gap-1.5">
                      <input type="checkbox" name="otherSpecialtyIds" value={s.id} />
                      {s.label}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">Patients search by these. Tick only what you actually treat, up to seven.</p>
              </fieldset>
            ) : null}

            {open.has("services") ? (
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <div>
                  <label className="label" htmlFor="serviceId">Your main service</label>
                  <select id="serviceId" name="serviceId" className="input" required defaultValue={defaultService?.id ?? ""}>
                    {services.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-muted">Add more services later from your workspace.</p>
                </div>
                <div>
                  <label className="label" htmlFor="feeRupees">Fee (₹)</label>
                  <input id="feeRupees" name="feeRupees" className="input" required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="e.g. 600" />
                </div>
              </div>
            ) : null}

            {open.has("hours") ? (
              <fieldset>
                <legend className="label">Clinic hours (patients book within these)</legend>
                <input type="hidden" name="hoursShown" value="1" />
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <label key={d} className="flex items-center gap-1.5">
                      <input type="checkbox" name="weekdays" value={d} defaultChecked={d !== 0} />
                      {WEEKDAYS[d].slice(0, 3)}
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <input type="time" name="localStart" className="input w-auto" defaultValue="10:00" required aria-label="Opens" />
                  <span>to</span>
                  <input type="time" name="localEnd" className="input w-auto" defaultValue="19:00" required aria-label="Closes" />
                </div>
                <p className="mt-1 text-xs text-muted">Fine-tune per day, add breaks or leave later in Calendar.</p>
              </fieldset>
            ) : null}

            {open.has("consent") ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="hidden" name="consentShown" value="1" />
                <input type="checkbox" name="consent" className="mt-1" required />
                <span>I accept the <Link href="/policies/provider-terms" className="underline" target="_blank">provider terms</Link> and agree that my profile is published once The Physio Index has verified my registration.</span>
              </label>
            ) : null}

            {open.has("practice") ? (
              <p className="text-sm">You also need to add <Link href="/workspace/clinics" className="underline">where you practise</Link> before you can submit.</p>
            ) : null}

            <button type="submit" className="btn btn-primary w-full">{completionPercent(items) === 100 ? "Submit for verification" : "Save and submit for verification"}</button>
            <p className="-mt-3 text-center text-xs text-muted">Nothing is public until we have verified your registration.</p>
          </form>
        )}
      </main>
    </div>
  );
}
