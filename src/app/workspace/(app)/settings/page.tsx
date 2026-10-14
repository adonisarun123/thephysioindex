import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Field, Notice, PageHeader, Section, StatePill } from "@/components/workspace/forms/ui";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { consentState, listAssociations, notificationPrefs, openClosureRequest } from "@/lib/workspace/queries";
import { contactRulesAction } from "@/app/workspace/(app)/clinics/actions";
import { requestClosureAction, savePreferencesAction, setBookingPausedAction, withdrawPublicationAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default function Page({ searchParams }: PageProps<"/workspace/settings">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Settings searchParams={searchParams} />
    </Suspense>
  );
}

const PAGE = "/workspace/settings";

/** Section 15 Settings: contact rules, notifications, booking pause (PRO-18), consent and account requests. */
async function Settings({ searchParams }: { searchParams: PageProps<"/workspace/settings">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const { viewer, practitioner: p } = await requireWorkspace(PAGE);
  const [associations, prefs, consents, closureOpen] = await Promise.all([listAssociations(p.id), notificationPrefs(viewer.userId), consentState(p.id), openClosureRequest(p.id)]);
  const live = associations.filter((a) => a.state !== "ended");
  const msg = readMessage(sp);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" lede={`Signed in as ${viewer.mobile ?? viewer.email ?? "you"}${p.isOwner ? " (owner)" : " (coordinator)"}.`} />
      <Notice ok={msg.ok} error={msg.error} />

      <Section title="Contact details" lede="Your login number is never published. Patients see clinic numbers only where you allow it; private numbers and home addresses are never shown (PRO-07).">
        <p className="text-sm">Login mobile: <strong>{viewer.mobile ?? "—"}</strong>{viewer.mobileVerified ? <StatePill state="verified" /> : null} · Change it from <Link href="/account" className="underline">My account</Link>; changing a login number requires verification of the new number (IAM-08).</p>
        <h3 className="mt-4 font-medium">Public phone per clinic</h3>
        {live.length === 0 ? <Empty>No clinics yet.</Empty> : (
          <ul className="mt-2 divide-y divide-line border-y border-line text-sm">
            {live.map((a) => (
              <li key={a.id} className="py-2">
                <form action={contactRulesAction} className="flex flex-wrap items-center justify-between gap-3">
                  <input type="hidden" name="associationId" value={a.id} />
                  <input type="hidden" name="back" value={PAGE} />
                  <label className="flex items-center gap-2"><input type="checkbox" name="showBranchPhone" defaultChecked={a.showBranchPhone} /> {a.clinicName}{a.branchName !== a.clinicName ? ` — ${a.branchName}` : ""} <span className="text-muted">{a.branchPhone ? `(${a.branchPhone})` : "(no phone on record)"}</span></label>
                  <button type="submit" className="btn btn-quiet py-1 text-xs">Save</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <form action={savePreferencesAction}>
        <Section title="Notifications" lede="Transactional messages about appointments cannot be fully switched off while you take bookings; choose channels and language.">
          <div className="grid gap-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="transactionalSms" defaultChecked={prefs.transactionalSms} /> SMS for bookings, cancellations and reminders</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="transactionalEmail" defaultChecked={prefs.transactionalEmail} /> Email for bookings, review outcomes and credential reminders</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="whatsappOptIn" defaultChecked={prefs.whatsappOptIn} /> WhatsApp (when the channel is enabled)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="marketingOptIn" defaultChecked={prefs.marketingOptIn} /> Product updates and tips</label>
            <div className="max-w-xs">
              <Field label="Preferred language" htmlFor="preferredLanguage">
                <select id="preferredLanguage" name="preferredLanguage" className="input" defaultValue={prefs.preferredLanguage}>
                  <option value="en">English</option>
                  <option value="hi">Hindi</option>
                  <option value="kn">Kannada</option>
                  <option value="ta">Tamil</option>
                </select>
              </Field>
            </div>
          </div>
          <div className="mt-4"><button type="submit" className="btn btn-secondary py-2 text-sm">Save preferences</button></div>
        </Section>
      </form>

      <Section title="Online bookings" lede="Pause new bookings without removing your profile. Public copy says online booking is unavailable; existing appointments are unaffected (PRO-18).">
        <form action={setBookingPausedAction} className="flex flex-wrap items-center gap-3 text-sm">
          <input type="hidden" name="paused" value={p.bookingPaused ? "0" : "1"} />
          <StatePill state={p.bookingPaused ? "paused" : p.bookingEligible ? "accepting" : "not_yet_eligible"} />
          <button type="submit" className="btn btn-quiet py-1.5 text-sm">{p.bookingPaused ? "Resume new bookings" : "Pause new bookings"}</button>
        </form>
      </Section>

      <Section title="Consent" lede="Recorded with policy versions (SEC-07).">
        <ul className="text-sm">
          <li>Profile publication: {consents.profilePublication ? <><StatePill state="granted" /> <span className="text-muted">version {consents.profilePublication}</span></> : <StatePill state="not_recorded" />}</li>
          <li className="mt-1">Provider terms: {consents.providerTerms ? <><StatePill state="granted" /> <span className="text-muted">version {consents.providerTerms}</span></> : <StatePill state="not_recorded" />}</li>
        </ul>
        {!consents.profilePublication || !consents.providerTerms ? <p className="mt-2 text-sm"><Link href="/workspace/onboarding?step=consent" className="underline">Record consent</Link></p> : null}
        {p.isOwner && consents.profilePublication ? (
          <form action={withdrawPublicationAction} className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="confirm" required /> Withdraw publication consent (pauses bookings; support unpublishes the listing)</label>
            <button type="submit" className="btn btn-quiet py-1.5 text-sm">Withdraw</button>
          </form>
        ) : null}
      </Section>

      <Section id="closure" title="Security and account" lede="Sessions last 30 days; sensitive actions may ask you to sign in again (IAM-03).">
        <p className="text-sm">Security settings and sign-out are on <Link href="/account" className="underline">My account</Link>.</p>
        <h3 className="mt-5 font-medium">Close this practitioner account</h3>
        {closureOpen ? <p className="mt-1 text-sm"><StatePill state="requested" /> A closure request is open. Support will contact you about any future appointments before anything is removed.</p> : p.isOwner ? (
          <form action={requestClosureAction} className="mt-2 grid gap-3 text-sm">
            <p className="text-muted">Closure first resolves future bookings and transfers any operational obligations; historical records follow the retention policy (PRO-18, SEC-09).</p>
            <Field label="Anything support should know (optional)" htmlFor="closure-note"><input id="closure-note" name="note" className="input" maxLength={500} /></Field>
            <label className="flex items-center gap-2"><input type="checkbox" name="confirm" required /> I understand my profile will be removed after future appointments are resolved.</label>
            <div><button type="submit" className="btn btn-quiet py-1.5 text-sm">Request account closure</button></div>
          </form>
        ) : <p className="mt-1 text-sm text-muted">Only the owner can request closure.</p>}
      </Section>
    </div>
  );
}
