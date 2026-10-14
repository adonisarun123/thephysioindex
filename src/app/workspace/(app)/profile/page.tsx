import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { AboutSection, CredentialsSection, ExperienceSection, ExpertiseSection, IdentitySection, PortfolioSection, QualificationsSection } from "@/components/workspace/profile-sections";
import { formatIst } from "@/lib/workspace/calendar";
import { listAuthorityOptions, listLanguageOptions, listSpecialtyOptions } from "@/lib/workspace/catalog";
import { latestCase } from "@/lib/workspace/cases";
import { requireWorkspace } from "@/lib/workspace/context";
import { getLatestVersion, validateForSubmission } from "@/lib/workspace/draft";
import { readMessage } from "@/lib/workspace/forms";
import { onboardingStatus } from "@/lib/workspace/onboarding";
import { listCredentials } from "@/lib/workspace/queries";
import { submitForReview } from "./actions";

export const metadata: Metadata = { title: "Profile editor" };

export default function Page({ searchParams }: PageProps<"/workspace/profile">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Editor searchParams={searchParams} />
    </Suspense>
  );
}

async function Editor({ searchParams }: { searchParams: PageProps<"/workspace/profile">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { practitioner: p } = await requireWorkspace("/workspace/profile");
  const [version, credentials, authorities, specialties, languages, review, status] = await Promise.all([
    getLatestVersion(p.id),
    listCredentials(p.id),
    listAuthorityOptions(),
    listSpecialtyOptions(),
    listLanguageOptions(),
    latestCase(p.id, ["listing_review", "profile_change"]),
    onboardingStatus(p.id),
  ]);
  const draft = version?.content ?? {};
  const gaps = validateForSubmission(draft, status);
  const msg = readMessage(sp);
  const published = p.listingStatus === "published";
  const hasUnsubmitted = version?.state === "draft";

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Profile"
        lede={published ? "Your published profile stays live while you edit. Changes go live after review." : "Drafts save per section and are never public until approved."}
        action={published ? <Link href={`/physiotherapist/${p.slug}-${p.publicId}`} className="btn btn-quiet py-2 text-sm">Preview public profile</Link> : null}
      />
      <Notice ok={msg.ok} error={msg.error} />

      <div className="card mt-6 flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <div>
          <p>
            Draft version {version?.version ?? "—"} · <StatePill state={version?.state ?? "none"} />
            {version?.submittedAt ? <span className="text-muted"> · submitted {formatIst(version.submittedAt)}</span> : null}
          </p>
          {review?.decisionReason ? <p className="mt-1 text-muted">Reviewer feedback: {review.decisionReason}</p> : null}
          {review && review.state !== "decided" && review.state !== "closed" ? <p className="mt-1 text-muted">A {review.caseType === "listing_review" ? "listing review" : "profile change review"} is {review.state.replace(/_/g, " ")}.</p> : null}
        </div>
        <a href="#submit" className="underline">Go to submit</a>
      </div>

      <IdentitySection identity={draft.identity} />
      <AboutSection about={draft.about} />
      <QualificationsSection items={draft.qualifications ?? []} />
      <ExperienceSection items={draft.experiences ?? []} />
      <ExpertiseSection draft={draft} specialties={specialties} languages={languages} />
      <PortfolioSection items={draft.portfolio ?? []} />
      <CredentialsSection credentials={credentials} authorities={authorities} />

      <Section id="submit" title={published ? "Submit changes for review" : "Submit for review"} lede={published ? "Identity, registration and degree changes trigger renewed review; the approved version remains visible meanwhile (VER-05)." : "Validates mandatory fields, requires current provider terms and opens a listing review (PRO-03)."}>
        {gaps.length ? (
          <div className="rounded-[var(--r-sm)] border border-mark bg-mark-soft p-3 text-sm">
            <p className="font-medium">Still needed</p>
            <ul className="mt-1 list-disc pl-5">{gaps.map((g) => <li key={g}>{g}</li>)}</ul>
            {!status.consents ? <p className="mt-2"><Link href="/workspace/onboarding?step=consent" className="underline">Record consent and accept terms</Link></p> : null}
          </div>
        ) : null}
        {!hasUnsubmitted ? (
          <p className="mt-3 text-sm text-muted">{version?.state === "submitted" ? "Your latest version is under review. Editing any section starts a new draft." : "No unsubmitted changes."}</p>
        ) : (
          <form action={submitForReview} className="mt-4">
            <button type="submit" className="btn btn-primary" disabled={gaps.length > 0} aria-disabled={gaps.length > 0}>{published ? "Submit changes" : "Submit profile"}</button>
          </form>
        )}
      </Section>
    </div>
  );
}
