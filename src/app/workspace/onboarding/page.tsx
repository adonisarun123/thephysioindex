import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { Notice } from "@/components/workspace/forms/ui";
import { CredentialsStep, IdentityStep } from "@/components/workspace/onboarding/steps-a";
import { ConsentStep, PracticeStep, ReviewStep, ServicesStep } from "@/components/workspace/onboarding/steps-b";
import { getViewer } from "@/lib/auth/session";
import {
  currentPolicyVersions,
  listAuthorityOptions,
  listCityOptions,
  listLanguageOptions,
  listLocalityOptions,
  listServiceOptions,
  listSpecialtyOptions,
  listStateOptions,
  offeringDefaults,
  searchBranches,
} from "@/lib/workspace/catalog";
import { resolveWorkspacePractitioner } from "@/lib/workspace/context";
import { validateForSubmission } from "@/lib/workspace/draft";
import { readMessage } from "@/lib/workspace/forms";
import { onboardingStatus, STEPS, type Step } from "@/lib/workspace/onboarding";
import { listAssociations, listCredentials } from "@/lib/workspace/queries";

export const metadata: Metadata = { title: "Create your profile", robots: { index: false, follow: false } };

const LABELS: Record<Step, string> = { identity: "Identity", credentials: "Credentials", practice: "Practice", services: "Services and expertise", consent: "Consent", review: "Review" };

/** Creation wizard (PRO-02): autosaving steps, resumable. Lives outside the workspace shell so a viewer without a profile is not redirected in a loop. */
export default function Page({ searchParams }: PageProps<"/workspace/onboarding">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-12 text-muted">Loading…</div>}>
      <Wizard searchParams={searchParams} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f-]{36}$/i;

async function Wizard({ searchParams }: { searchParams: PageProps<"/workspace/onboarding">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?as=practitioner&next=${encodeURIComponent("/workspace/onboarding")}`);
  const practitioner = await resolveWorkspacePractitioner(viewer);
  const requested = typeof sp.step === "string" && (STEPS as readonly string[]).includes(sp.step) ? (sp.step as Step) : "identity";
  const step: Step = practitioner ? requested : "identity";
  const msg = readMessage(sp);
  const status = practitioner ? await onboardingStatus(practitioner.id) : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/" aria-label="The Physio Index home"><Logo /></Link>
          <nav className="flex items-center gap-3 text-sm">
            {practitioner ? <Link href="/workspace" className="underline">Workspace</Link> : <Link href="/claim" className="underline">Claim an existing profile instead</Link>}
            <form action="/sign-out" method="post"><button className="underline" type="submit">Sign out</button></form>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">{practitioner ? `Set up ${practitioner.displayName}` : "Create your professional profile"}</h1>
        <p className="mt-1 text-sm text-muted">Each step saves on its own. Come back any time; nothing is public until a reviewer approves your submission.</p>
        <ol className="mt-5 flex flex-wrap gap-2 text-sm" aria-label="Steps">
          {STEPS.map((s, i) => {
            const enabled = Boolean(practitioner) || s === "identity";
            const complete = status?.completed[s] ?? false;
            const cls = s === step ? "bg-brand text-white" : complete ? "bg-brand-soft text-brand-ink" : "bg-surface-2 text-ink-2";
            return (
              <li key={s}>
                {enabled ? (
                  <Link href={`/workspace/onboarding?step=${s}`} aria-current={s === step ? "step" : undefined} className={`pill py-1 ${cls}`}>{i + 1}. {LABELS[s]}</Link>
                ) : (
                  <span className={`pill py-1 ${cls}`} aria-disabled="true">{i + 1}. {LABELS[s]}</span>
                )}
              </li>
            );
          })}
        </ol>
        <Notice ok={msg.ok} error={msg.error} />
        <StepBody step={step} practitionerId={practitioner?.id ?? null} listingStatus={practitioner?.listingStatus ?? "draft"} sp={sp} status={status} />
      </div>
    </div>
  );
}

async function StepBody({ step, practitionerId, listingStatus, sp, status }: { step: Step; practitionerId: string | null; listingStatus: string; sp: Record<string, string | string[] | undefined>; status: Awaited<ReturnType<typeof onboardingStatus>> | null }) {
  if (step === "identity" || !practitionerId || !status) {
    return <IdentityStep identity={status?.draft.identity} isNew={!practitionerId} />;
  }
  if (step === "credentials") {
    const [credentials, authorities] = await Promise.all([listCredentials(practitionerId), listAuthorityOptions()]);
    return <CredentialsStep qualifications={status.draft.qualifications ?? []} credentials={credentials} authorities={authorities} />;
  }
  if (step === "practice") {
    const clinicQ = typeof sp.clinicQ === "string" ? sp.clinicQ.trim() : "";
    const clinicCity = typeof sp.clinicCity === "string" ? sp.clinicCity.trim() : "";
    const stateId = typeof sp.stateId === "string" && UUID.test(sp.stateId) ? sp.stateId : undefined;
    const cityId = typeof sp.cityId === "string" && UUID.test(sp.cityId) ? sp.cityId : undefined;
    const [associations, hits, states, cities, localities] = await Promise.all([
      listAssociations(practitionerId),
      clinicQ ? searchBranches(clinicQ, clinicCity || undefined) : Promise.resolve([]),
      listStateOptions(),
      stateId ? listCityOptions(stateId) : Promise.resolve([]),
      cityId ? listLocalityOptions(cityId) : Promise.resolve([]),
    ]);
    return <PracticeStep associations={associations} hits={hits} query={{ clinicQ, clinicCity, stateId, cityId }} states={states} cities={cities} localities={localities} />;
  }
  if (step === "services") {
    const [associations, services, defaults, specialties, languages] = await Promise.all([listAssociations(practitionerId), listServiceOptions(), offeringDefaults(), listSpecialtyOptions(), listLanguageOptions()]);
    return <ServicesStep associations={associations} services={services} defaults={defaults} draft={status.draft} specialties={specialties} languages={languages} />;
  }
  if (step === "consent") {
    const versions = await currentPolicyVersions();
    return <ConsentStep versions={versions} done={status.consents} />;
  }
  const gaps = validateForSubmission(status.draft, status);
  return <ReviewStep status={status} gaps={gaps} listingStatus={listingStatus} />;
}
