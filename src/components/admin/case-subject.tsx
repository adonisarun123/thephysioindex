import Link from "next/link";
import { DL, JsonView, Pill, Section } from "@/components/admin/ui";
import { fmtDate, fmtDateTime } from "@/lib/admin/format";
import { diffContent, type StructuredContent } from "@/lib/admin/profile-content";
import { formatPaise } from "@/lib/money";

/**
 * Subject panel for a review case, rendered per subject type. Drafts and
 * evidence render here for reviewers only; nothing in this component is
 * reachable from a public route (PRO-10, DAT-02).
 */
export function CaseSubject({ subjectType, subject }: { subjectType: string; subject: Record<string, unknown> | null }) {
  if (!subject) return <Section title="Subject"><p className="text-sm text-muted">The subject record could not be loaded (it may have been removed).</p></Section>;
  const s = subject as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (subjectType) {
    case "profile_version":
      return <ProfileVersion s={s} />;
    case "practitioner":
      return (
        <Section title="Practitioner">
          <DL items={[["Name", <Link key="n" href={`/admin/practitioners/${s.id}`} className="underline">{s.displayName}</Link>], ["Public ID", s.publicId], ["Listing", <Pill key="l" status={s.listingStatus} />], ["Claim", <Pill key="c" status={s.claimState} />], ["Booking eligible", s.bookingEligible ? "Yes" : "No"], ["Source", s.source]]} />
          {s.latestDraft ? <div className="mt-3"><h3 className="text-sm font-semibold">Latest draft (v{s.latestDraft.version}, {s.latestDraft.state})</h3><JsonView value={s.latestDraft.structuredContent} /></div> : null}
          <Credentials list={s.credentials} />
        </Section>
      );
    case "claim_request":
      return (
        <Section title="Claim request">
          <DL
            items={[
              ["Listing", <Link key="p" href={`/admin/practitioners/${s.practitionerId}`} className="underline">{s.practitionerName}</Link>],
              ["Current claim state", <Pill key="c" status={s.claimState} />],
              ["Current owner", s.ownerUserId ? `Claimed by ${String(s.ownerUserId).slice(0, 8)}…` : "Unclaimed"],
              ["Claimant", s.claimantName],
              ["Claimant contact", `${s.claimantMobileVerified ? "mobile verified" : "mobile unverified"}, ${s.claimantEmailVerified ? "email verified" : "email unverified"}`],
              ["Request state", <Pill key="s" status={s.state} />],
              ["Competing open claims", Number(s.competingClaims) > 0 ? <strong key="cc" className="text-alert">{s.competingClaims} — ownership is frozen until resolved (PRO-06)</strong> : "None"],
              ["Requested", fmtDateTime(s.createdAt)],
            ]}
          />
          <h3 className="mt-3 text-sm font-semibold">Evidence supplied</h3>
          <p className="text-xs text-muted">An OTP to a newly entered number alone does not transfer a listing (PRO-04).</p>
          <JsonView value={s.evidence} />
        </Section>
      );
    case "credential":
      return (
        <Section title="Credential">
          <DL
            items={[
              ["Practitioner", <Link key="p" href={`/admin/practitioners/${s.practitionerId}`} className="underline">{s.practitionerName}</Link>],
              ["Type", s.type?.replace("_", " ")],
              ["Authority", `${s.authority} (${String(s.authorityKind).replace("_", " ")})${s.acceptedForBooking ? " · accepted for booking" : ""}`],
              ["Number", <span key="n">{s.numberOriginal ?? "—"} <span className="text-muted">normalised {s.numberNormalised ?? "—"}</span></span>],
              ["Issue / expiry", `${fmtDate(s.issueDate)} / ${fmtDate(s.expiresOn)}`],
              ["Current status", <Pill key="s" status={s.status} />],
              ["Source", s.source ?? "—"],
              ["Last checked", s.lastCheckedAt ? `${fmtDateTime(s.lastCheckedAt)} — ${s.scopeOfCheck ?? ""}` : "Never"],
              ["Next review", fmtDate(s.nextReviewAt)],
              ["Public number approved", s.publicNumberApproved ? "Yes" : "No"],
              ["Evidence document", s.evidenceAssetId ? `Private asset ${String(s.evidenceAssetId).slice(0, 8)}… (served through a signed link; never public)` : "None uploaded"],
              ["Official lookup", s.lookupUrl ? <a key="u" href={s.lookupUrl} target="_blank" rel="noreferrer noopener" className="underline">{s.lookupUrl}</a> : "No public register recorded for this authority"],
            ]}
          />
          {Array.isArray(s.sameNumberElsewhere) && s.sameNumberElsewhere.length ? (
            <p className="mt-3 rounded-[var(--r-sm)] bg-alert-soft px-3 py-2 text-sm text-alert">
              Same issuer and number also appears on: {s.sameNumberElsewhere.map((o: { practitionerId: string; name: string; status: string }) => (
                <Link key={o.practitionerId} href={`/admin/practitioners/${o.practitionerId}`} className="underline">{o.name} ({o.status})</Link>
              ))}{" "}
              — possible duplicate (PRO-05).
            </p>
          ) : null}
        </Section>
      );
    case "duplicate_candidate":
      return (
        <Section title="Duplicate candidate pair">
          <p className="text-sm text-muted">Match reasons: {(s.matchReasons ?? []).join(", ")} · score {s.score}{s.resolved ? " · resolved" : ""}</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {(["a", "b"] as const).map((k) => {
              const p = s[k];
              return (
                <div key={k} className="rounded-[var(--r-sm)] border border-line p-3">
                  <h3 className="font-semibold">{k.toUpperCase()}: <Link href={`/admin/practitioners/${p.id}`} className="underline">{p.name}</Link></h3>
                  <DL items={[["Public ID", p.publicId], ["Listing", <Pill key="l" status={p.listingStatus} />], ["Claim", <Pill key="c" status={p.claimState} />], ["Source", p.source], ["Created", fmtDateTime(p.createdAt)], ["Bookings", String(p.bookings)], ["Credentials", (p.credentials ?? []).join("; ") || "—"], ["Branches", (p.branches ?? []).join("; ") || "—"]]} />
                </div>
              );
            })}
          </div>
        </Section>
      );
    case "offer_version":
      return (
        <Section title="Offer">
          <DL
            items={[
              ["Title", `${s.title}${s.code ? ` (code ${s.code})` : ""} · v${s.version}`],
              ["Scope", s.scopeType === "clinic" ? `Clinic · ${s.clinicName}` : `Practitioner · ${s.practitionerName}`],
              ["Discount", s.type === "fixed" ? formatPaise(Number(s.value)) : `${(Number(s.value) / 100).toFixed(2)} %`],
              ["Valid", `${fmtDateTime(s.startsAt)} → ${fmtDateTime(s.endsAt)}`],
              ["Minimum spend / cap", `${formatPaise(Number(s.minSpendPaise))} / ${s.maxDiscountPaise != null ? formatPaise(Number(s.maxDiscountPaise)) : "none"}`],
              ["Redemption caps", `total ${s.totalCap ?? "∞"}, per patient ${s.perPatientCap}`],
              ["Conditions", `${s.firstVisitOnly ? "first visit only; " : ""}${s.automatic ? "applied automatically" : "code required"}`],
              ["Regular price confirmed", s.regularPriceConfirmed ? "Yes" : <strong key="r" className="text-alert">No — a discount against an unconfirmed regular price is not approvable (OFR-01)</strong>],
              ["Offer state", <Pill key="s" status={s.offerState} />],
              ["Moderation", <Pill key="m" status={s.moderationState} />],
            ]}
          />
          <h3 className="mt-3 text-sm font-semibold">Terms</h3>
          <p className="whitespace-pre-wrap text-sm">{s.terms}</p>
        </Section>
      );
    case "review":
      return (
        <Section title="Review">
          <DL items={[["Practitioner", <Link key="p" href={`/admin/practitioners/${s.practitionerId}`} className="underline">{s.practitionerName}</Link>], ["Booking", `${s.bookingReference} · ${s.bookingStatus} · ${fmtDateTime(s.appointmentAt)}`], ["Rating", `${s.rating} / 5`], ["Display name", s.displayName], ["State", <Pill key="s" status={s.state} />], ["Submitted", fmtDateTime(s.createdAt)]]} />
          <blockquote className="mt-3 whitespace-pre-wrap rounded-[var(--r-sm)] bg-surface-2 p-3 text-sm">{s.text ?? <em className="text-muted">No text</em>}</blockquote>
          <p className="mt-2 text-xs text-muted">Negative feedback is not removed for being negative; reject only for abuse, spam or personal information (REV-03).</p>
        </Section>
      );
    case "locality_proposal":
      return (
        <Section title="Locality proposal">
          <DL items={[["Proposed name", s.proposedName], ["PIN", s.proposedPinCode ?? "—"], ["City", `${s.cityName}, ${s.stateName}`], ["Branch", s.branchName ?? "—"], ["State", <Pill key="s" status={s.state} />]]} />
          <h3 className="mt-3 text-sm font-semibold">Similar existing localities</h3>
          <ul className="text-sm">
            {(s.similar ?? []).map((l: { id: string; name: string; similarity: number }) => (
              <li key={l.id}>{l.name} <span className="text-muted">similarity {l.similarity}</span> <span className="text-xs text-muted">({l.id})</span></li>
            ))}
            {!(s.similar ?? []).length ? <li className="text-muted">None</li> : null}
          </ul>
          <p className="mt-1 text-xs text-muted">To map onto an existing locality instead of creating one, paste its id into the decision form.</p>
        </Section>
      );
    case "booking":
      return <Section title="Booking"><DL items={[["Reference", s.reference], ["Status", <Pill key="s" status={s.status} />], ["Appointment", fmtDateTime(s.startsAt)], ["Practitioner", s.practitionerName], ["Where", `${s.clinicName} · ${s.branchName}`], ["Source", s.source]]} /></Section>;
    case "user":
      return <Section title="Account"><DL items={[["Name", s.name], ["Email", s.email ?? "—"], ["Status", <Pill key="s" status={s.status} />], ["Current roles", (s.roles ?? []).join(", ") || "none"]]} /></Section>;
    default:
      return <Section title="Subject"><JsonView value={subject} /></Section>;
  }
}

function ProfileVersion({ s }: { s: Record<string, any> }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const draft = (s.structuredContent ?? {}) as StructuredContent;
  const published = (s.publishedContent ?? null) as StructuredContent | null;
  const diff = diffContent(published, draft);
  const labels: Labels = { specialties: (s.specialtyLabels ?? {}) as Record<string, string>, languages: (s.languageLabels ?? {}) as Record<string, string> };
  return (
    <Section title={`Profile version ${s.version}`}>
      <DL items={[["Practitioner", <Link key="p" href={`/admin/practitioners/${s.practitionerId}`} className="underline">{s.displayName}</Link>], ["Version state", <Pill key="s" status={s.state} />], ["Listing", <Pill key="l" status={s.listingStatus} />], ["Submitted", fmtDateTime(s.submittedAt)], ["Published version", s.publishedVersionId ? "exists (stays visible until approval, VER-05)" : "none"]]} />
      <h3 className="mt-4 text-sm font-semibold">{published ? "Changes versus published" : "Submitted content"}</h3>
      {diff.length === 0 ? <p className="text-sm text-muted">No field differs from the published version.</p> : null}
      <div className="mt-1 grid gap-2">
        {diff.map((d) => (
          <div key={d.field} className="rounded-[var(--r-sm)] border border-line p-2 text-sm">
            <p className="font-semibold">{FIELD_LABELS[d.field] ?? d.field}</p>
            {published ? <div className="grid gap-2 md:grid-cols-2"><div><p className="text-xs text-muted">Published</p><Field field={d.field} v={d.before} labels={labels} /></div><div><p className="text-xs text-muted">Draft</p><Field field={d.field} v={d.after} labels={labels} /></div></div> : <Field field={d.field} v={d.after} labels={labels} />}
          </div>
        ))}
      </div>
      <Credentials list={s.credentials} />
      <Branches list={s.branches} />
    </Section>
  );
}

const FIELD_LABELS: Record<string, string> = { displayName: "Display name", designation: "Designation", headline: "Headline", about: "About", gender: "Gender", practiceStartDate: "Practising since", qualifications: "Qualifications", experiences: "Experience", specialties: "Areas of practice", languages: "Languages", portfolio: "Portfolio" };

type Labels = { specialties: Record<string, string>; languages: Record<string, string> };

/** Human rendering of the structured fields a reviewer compares; unknown shapes fall back to JSON. */
function Field({ field, v, labels }: { field: string; v: unknown; labels: Labels }) {
  if (v == null || v === "") return <p className="text-muted">—</p>;
  if (field === "qualifications" && Array.isArray(v)) {
    return (
      <ul className="list-disc pl-5">
        {(v as { degree?: string; institution?: string; completionYear?: number; inProgress?: boolean }[]).map((q, i) => (
          <li key={i}>{q.degree ?? "—"}{q.institution ? ` — ${q.institution}` : ""}{q.completionYear ? ` (${q.completionYear}${q.inProgress ? ", in progress" : ""})` : q.inProgress ? " (in progress)" : ""}</li>
        ))}
      </ul>
    );
  }
  if (field === "specialties" && Array.isArray(v)) {
    const items = (v as (string | { id?: string; code?: string; isPrimary?: boolean })[]).map((x) => {
      const key = typeof x === "string" ? x : (x.id ?? x.code ?? "");
      const primary = typeof x === "object" && x.isPrimary;
      return `${labels.specialties[key] ?? key}${primary ? " (primary)" : ""}`;
    });
    return <p>{items.join(", ")}</p>;
  }
  if (field === "languages" && Array.isArray(v)) {
    const items = (v as (string | { id?: string; code?: string })[]).map((x) => { const key = typeof x === "string" ? x : (x.id ?? x.code ?? ""); return labels.languages[key] ?? key; });
    return <p>{items.join(", ")}</p>;
  }
  if (field === "experiences" && Array.isArray(v)) {
    return (
      <ul className="list-disc pl-5">
        {(v as { role?: string; organisation?: string; from?: string; to?: string | null }[]).map((e, i) => (
          <li key={i}>{[e.role, e.organisation].filter(Boolean).join(" at ")}{e.from ? ` · ${e.from} – ${e.to ?? "present"}` : ""}</li>
        ))}
      </ul>
    );
  }
  return <Val v={v} />;
}

function Branches({ list }: { list: unknown }) {
  const rows = Array.isArray(list) ? (list as { id: string; state: string; label: string; place: string | null; branchStatus: string }[]) : [];
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">Clinics</h3>
      {rows.length === 0 ? <p className="text-sm text-muted">No clinic association. The listing will not appear on any location page until one is approved (LOC-02).</p> : null}
      <ul className="mt-1 divide-y divide-line text-sm">
        {rows.map((b) => (
          <li key={b.id} className="flex flex-wrap items-center gap-2 py-1">
            <span>{b.label}</span>{b.place ? <span className="text-muted">· {b.place}</span> : null}
            <Pill status={b.state} />{b.branchStatus !== "published" ? <Pill status={b.branchStatus} /> : null}
          </li>
        ))}
      </ul>
      {rows.some((b) => b.state === "pending") ? <p className="mt-1 text-xs text-muted">Approving a new listing also approves its pending clinic associations.</p> : null}
    </div>
  );
}

function Val({ v }: { v: unknown }) {
  if (v == null || v === "") return <p className="text-muted">—</p>;
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return <p className="whitespace-pre-wrap">{String(v)}</p>;
  return <JsonView value={v} />;
}

function Credentials({ list }: { list: unknown }) {
  const rows = Array.isArray(list) ? (list as { id: string; type: string; authority: string; number: string | null; status: string; expiresOn: string | null }[]) : [];
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">Credentials</h3>
      {rows.length === 0 ? <p className="text-sm text-muted">None declared.</p> : null}
      <ul className="mt-1 divide-y divide-line text-sm">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-1">
            <span>{c.type.replace("_", " ")}</span><span className="text-muted">·</span><span>{c.authority}</span><span className="text-muted">·</span><span>{c.number ?? "no number"}</span>
            <Pill status={c.status} />{c.expiresOn ? <span className="text-xs text-muted">expires {fmtDate(c.expiresOn)}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
