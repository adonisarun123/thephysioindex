"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

/** Staff sign-in: email OTP, then TOTP (IAM-03, SEC-02). */
export function EmailSignIn({ next = "/admin" }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    setBusy(true);
    const res = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setBusy(false);
    // Always advance: the response must not reveal whether the account exists (IAM-07).
    if (res.error && res.error.status === 429) return setError("Too many attempts. Wait a minute and try again.");
    setStep("otp");
  }

  async function verify() {
    setError(null);
    setBusy(true);
    const res = await authClient.signIn.emailOtp({ email, otp });
    setBusy(false);
    if (res.error) return setError("That code is not valid or has expired.");
    const data = res.data as { twoFactorRedirect?: boolean } | null;
    if (data?.twoFactorRedirect) {
      window.location.href = `/admin/mfa?next=${encodeURIComponent(next)}`;
      return;
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
        <label className="label" htmlFor="email">Work email</label>
        <input id="email" type="email" className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={step === "otp"} required />
      </div>
      {step === "otp" ? (
        <div>
          <label className="label" htmlFor="otp">6-digit code</label>
          <input id="otp" className="input tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} autoFocus required />
          <p className="mt-1 text-xs text-muted">If this email belongs to a staff account, a code has been sent. It expires in 5 minutes.</p>
        </div>
      ) : null}
      {error ? <p role="alert" className="rounded-[var(--r-sm)] bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Please wait…" : step === "email" ? "Send code" : "Continue"}
      </button>
    </form>
  );
}
