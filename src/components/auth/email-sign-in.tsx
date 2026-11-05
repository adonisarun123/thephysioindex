"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

/**
 * Email OTP sign-in.
 * - staff: then TOTP (IAM-03, SEC-02).
 * - practitioner: signs in or creates the account, then records the
 *   practitioner intent like the mobile flow does. A staff account using this
 *   form still gets the TOTP challenge (enforced server-side).
 */
export function EmailSignIn({ next = "/admin", audience = "staff" }: { next?: string; audience?: "staff" | "practitioner" }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const staff = audience === "staff";

  async function send() {
    setError(null);
    setBusy(true);
    const res = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
    setBusy(false);
    // Always advance: the response must not reveal whether the account exists (IAM-07).
    if (res.error && res.error.status === 429) return setError("Too many attempts. Wait a minute and try again.");
    setStep("otp");
    setCooldown(60);
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? (clearInterval(t), 0) : c - 1)), 1000);
  }

  async function verify() {
    setError(null);
    setBusy(true);
    const res = await authClient.signIn.emailOtp({ email: email.trim(), otp });
    if (res.error) {
      setBusy(false);
      return setError("That code is not valid or has expired.");
    }
    const data = res.data as { twoFactorRedirect?: boolean } | null;
    if (data?.twoFactorRedirect) {
      window.location.href = `/admin/mfa?next=${encodeURIComponent(staff ? next : "/admin")}`;
      return;
    }
    if (!staff) {
      await fetch("/api/v1/me/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "practitioner" }) }).catch(() => {});
    }
    window.location.href = next;
  }

  return (
    <form
      className="card grid gap-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        void (step === "email" ? send() : verify());
      }}
    >
      <div>
        <label className="label" htmlFor="email">{staff ? "Work email" : "Email address"}</label>
        <input id="email" type="email" className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={step === "otp"} required />
      </div>
      {step === "otp" ? (
        <div>
          <label className="label" htmlFor="otp">6-digit code</label>
          <input id="otp" className="input tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} autoFocus required />
          <p className="mt-1 text-xs text-muted">
            {staff ? "If this email belongs to a staff account, a code has been sent." : "We have emailed you a code. Check your spam folder if it does not arrive within a minute."} It expires in 5 minutes.
          </p>
        </div>
      ) : null}
      {error ? <p role="alert" className="rounded-[var(--r-sm)] bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Please wait…" : step === "email" ? "Send code" : "Continue"}
      </button>
      {step === "otp" ? (
        <div className="flex justify-between text-sm">
          <button type="button" className="underline" onClick={() => { setStep("email"); setOtp(""); }}>Change email</button>
          <button type="button" className="underline disabled:no-underline disabled:opacity-60" disabled={cooldown > 0 || busy} onClick={() => void send()}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      ) : null}
      {!staff ? (
        <p className="text-xs text-muted">By continuing you agree to the <Link href="/policies/terms" className="underline">terms</Link> and <Link href="/policies/privacy" className="underline">privacy notice</Link>.</p>
      ) : null}
    </form>
  );
}
