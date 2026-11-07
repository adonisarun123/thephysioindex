"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { registerPhysio } from "@/app/for-physiotherapists/join/actions";
import { PlaceCascade } from "@/components/workspace/forms/place-cascade";
import { authClient } from "@/lib/auth/client";
import type { AuthorityOption, Option } from "@/lib/workspace/catalog";
import { DEGREES, PRACTICE_MODES } from "@/lib/workspace/registration-options";

type Props = {
  states: Option[];
  authorities: AuthorityOption[];
  attribution: Record<string, string>;
  signedInEmail: string | null;
};

/**
 * One-screen practitioner registration (PRO-02). The email is proved with a
 * one-time code before anything is created; the server action then builds the
 * draft profile from the same form. Already signed-in practitioners skip the code.
 */
export function PhysioRegistration({ states, authorities, attribution, signedInEmail }: Props) {
  const form = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState(signedInEmail ?? "");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"details" | "otp">("details");
  // True once the email code has been accepted in this page: later retries skip the code.
  const [verified, setVerified] = useState(Boolean(signedInEmail));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [mode, setMode] = useState<string>("");
  const [degree, setDegree] = useState<string>("");
  const clinic = PRACTICE_MODES.find((m) => m.value === mode)?.kind === "clinic";
  const homeVisits = mode === "home_visits";

  async function sendCode() {
    setBusy(true);
    const res = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
    setBusy(false);
    if (res.error && res.error.status === 429) return setError("Too many attempts. Wait a minute and try again.");
    setStep("otp");
    setCooldown(60);
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? (clearInterval(t), 0) : c - 1)), 1000);
  }

  async function create() {
    const res = await registerPhysio(new FormData(form.current!));
    if (res.redirectTo) {
      window.location.href = res.redirectTo;
      return;
    }
    setBusy(false);
    setError(res.error ?? "Something went wrong. Please try again.");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (verified) {
      setBusy(true);
      return create();
    }
    if (step === "details") return sendCode();
    setBusy(true);
    const res = await authClient.signIn.emailOtp({ email: email.trim(), otp });
    if (res.error) {
      setBusy(false);
      return setError("That code is not valid or has expired.");
    }
    if ((res.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setBusy(false);
      return setError("This email belongs to a staff account. Use your own email to register a practice.");
    }
    // The email is verified and the session cookie is set; a retry after a validation error
    // must not ask for (or re-use) a code.
    setVerified(true);
    setStep("details");
    await create();
  }

  const locked = step === "otp";

  return (
    <form ref={form} onSubmit={(e) => void onSubmit(e)} className="mt-5 grid gap-4">
      {Object.entries(attribution).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="hidden" aria-hidden>
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <fieldset inert={locked} className={`grid gap-4 ${locked ? "opacity-60" : ""}`}>
        <div>
          <label className="label" htmlFor="fullName">Full name</label>
          <input id="fullName" name="fullName" className="input" required minLength={2} maxLength={120} autoComplete="name" placeholder="Priya Sharma" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="reg-email">Email</label>
            <input id="reg-email" type="email" className="input" required maxLength={120} autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} readOnly={verified} />
            <p className="mt-1 text-xs text-muted">{verified ? "Verified." : "We email you a code to verify it."}</p>
          </div>
          <div>
            <label className="label" htmlFor="mobile">Mobile number</label>
            <input id="mobile" name="mobile" className="input" required inputMode="tel" autoComplete="tel" maxLength={20} placeholder="10-digit mobile" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="degree">Qualification</label>
            <select id="degree" name="degree" className="input" required value={degree} onChange={(e) => setDegree(e.target.value)}>
              <option value="" disabled>Choose one</option>
              {DEGREES.map((d) => <option key={d} value={d}>{d}</option>)}
              <option value="__other">Other</option>
            </select>
          </div>
          {degree === "__other" ? (
            <div>
              <label className="label" htmlFor="degreeOther">Your qualification</label>
              <input id="degreeOther" name="degreeOther" className="input" required minLength={2} maxLength={120} />
            </div>
          ) : null}
          <div className={degree === "__other" ? "sm:col-span-2" : undefined}>
            <label className="label" htmlFor="institution">College or university</label>
            <input id="institution" name="institution" className="input" required minLength={2} maxLength={160} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="authorityId">Registered with</label>
            <select id="authorityId" name="authorityId" className="input" required defaultValue="">
              <option value="" disabled>State council or IAP</option>
              {authorities.map((a) => (
                <option key={a.id} value={a.id}>{a.label}{a.jurisdiction ? ` — ${a.jurisdiction}` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="registrationNumber">Registration number</label>
            <input id="registrationNumber" name="registrationNumber" className="input" required minLength={2} maxLength={60} placeholder="As printed on your certificate" />
          </div>
        </div>

        <div>
          <span className="label">Where do you see patients?</span>
          <div className="mt-1 grid gap-2 sm:grid-cols-3" role="radiogroup">
            {PRACTICE_MODES.map((m) => (
              <label key={m.value} className={`flex cursor-pointer items-center gap-2 rounded-[var(--r-ctl)] border px-3 py-2 text-sm ${mode === m.value ? "border-brand bg-brand-soft font-medium" : "border-line"}`}>
                <input type="radio" name="practiceMode" value={m.value} required checked={mode === m.value} onChange={() => setMode(m.value)} />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        {mode ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {clinic ? (
              <>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="clinicName">Clinic name</label>
                  <input id="clinicName" name="clinicName" className="input" required minLength={2} maxLength={160} />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="addressLine1">Clinic address</label>
                  <input id="addressLine1" name="addressLine1" className="input" required minLength={3} maxLength={200} placeholder="Building, street" autoComplete="street-address" />
                </div>
              </>
            ) : null}
            <PlaceCascade states={states} cities={[]} localities={[]} selected={{}} reloadAction="/for-physiotherapists/join" idPrefix="reg-" />
            <div>
              <label className="label" htmlFor="pinCode">PIN code</label>
              <input id="pinCode" name="pinCode" className="input" inputMode="numeric" pattern="[1-9][0-9]{5}" required maxLength={6} />
              {homeVisits ? <p className="mt-1 text-xs text-muted">For the area you cover. Never shown publicly.</p> : null}
            </div>
          </div>
        ) : null}

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consentTerms" className="mt-1" required />
          <span>I accept the <Link href="/policies/provider-terms" className="underline" target="_blank">provider terms</Link> and agree that my profile is published once The Physio Index has verified my registration.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consentContact" className="mt-1" required />
          <span>The Physio Index may call, SMS or WhatsApp me about my listing. <Link href="/policies/privacy" className="underline" target="_blank">Privacy notice</Link>.</span>
        </label>
      </fieldset>

      {locked ? (
        <div className="rounded-[var(--r-ctl)] bg-brand-soft p-3">
          <label className="label" htmlFor="reg-otp">Enter the 6-digit code sent to {email.trim()}</label>
          <input id="reg-otp" className="input tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} autoFocus required />
          <div className="mt-2 flex justify-between text-sm">
            <button type="button" className="underline" onClick={() => { setStep("details"); setOtp(""); setError(null); }}>Edit details</button>
            <button type="button" className="underline disabled:no-underline disabled:opacity-60" disabled={cooldown > 0 || busy} onClick={() => void sendCode()}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">Check your spam folder if it does not arrive within a minute. It expires in 5 minutes.</p>
        </div>
      ) : null}

      {error ? <p role="alert" className="rounded-[var(--r-ctl)] bg-alert-soft p-3 text-sm text-alert">{error}</p> : null}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Please wait…" : verified ? "Create my profile" : locked ? "Verify and create my profile" : "Verify email and continue"}
      </button>
    </form>
  );
}
