"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

/** Mobile OTP sign-in for patients and practitioners (IAM-06, IAM-07). */
export function PhoneSignIn({ next = "/account", intent = "patient" }: { next?: string; intent?: "patient" | "practitioner" }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const e164 = () => {
    const d = phone.replace(/[^\d]/g, "");
    const national = d.length === 12 && d.startsWith("91") ? d.slice(2) : d.length === 11 && d.startsWith("0") ? d.slice(1) : d;
    return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
  };

  async function send() {
    setError(null);
    const p = e164();
    if (!p) return setError("Enter a 10-digit Indian mobile number.");
    setBusy(true);
    const res = await authClient.phoneNumber.sendOtp({ phoneNumber: p });
    setBusy(false);
    if (res.error) return setError(res.error.status === 429 ? "Too many attempts. Wait a minute and try again." : "We couldn't send a code right now. Try again.");
    setStep("code");
    setCooldown(60);
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? (clearInterval(t), 0) : c - 1)), 1000);
  }

  async function verify() {
    setError(null);
    const p = e164();
    if (!p || code.length !== 6) return setError("Enter the 6-digit code.");
    setBusy(true);
    const res = await authClient.phoneNumber.verify({ phoneNumber: p, code, disableSession: false });
    setBusy(false);
    if (res.error) return setError("That code is not valid or has expired."); // never reveals account existence (IAM-07)
    if (intent === "practitioner") {
      await fetch("/api/v1/me/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "practitioner" }) }).catch(() => {});
    }
    window.location.href = next;
  }

  return (
    <form
      className="card grid gap-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        void (step === "phone" ? send() : verify());
      }}
    >
      <div>
        <label className="label" htmlFor="phone">Mobile number</label>
        <div className="flex gap-2">
          <span className="input w-auto select-none bg-surface-2 text-muted">+91</span>
          <input id="phone" className="input" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={step === "code"} required />
        </div>
      </div>
      {step === "code" ? (
        <div>
          <label className="label" htmlFor="code">6-digit code</label>
          <input id="code" className="input tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus required />
          <p className="mt-1 text-xs text-muted">Sent by SMS. It expires in 5 minutes.</p>
        </div>
      ) : null}
      {error ? <p role="alert" className="rounded-[var(--r-sm)] bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Please wait…" : step === "phone" ? "Send code" : "Verify and continue"}
      </button>
      {step === "code" ? (
        <div className="flex justify-between text-sm">
          <button type="button" className="underline" onClick={() => { setStep("phone"); setCode(""); }}>Change number</button>
          <button type="button" className="underline disabled:no-underline disabled:opacity-60" disabled={cooldown > 0 || busy} onClick={() => void send()}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>
      ) : null}
      <p className="text-xs text-muted">By continuing you agree to the <Link href="/policies/terms" className="underline">terms</Link> and <Link href="/policies/privacy" className="underline">privacy notice</Link>.</p>
    </form>
  );
}
