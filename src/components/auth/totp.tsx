"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export function TotpVerify({ next = "/admin" }: { next?: string }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function verify() {
    setBusy(true);
    setError(null);
    const res = await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
    setBusy(false);
    if (res.error) return setError("That code is not valid. Codes change every 30 seconds.");
    window.location.href = next;
  }
  return (
    <form className="card grid gap-4 p-6" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
      <label className="label" htmlFor="totp">Authenticator code</label>
      <input id="totp" className="input tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus required />
      {error ? <p role="alert" className="rounded-[var(--r-sm)] bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Checking…" : "Verify"}</button>
    </form>
  );
}

export function TotpEnrol() {
  const [uri, setUri] = useState<string | null>(null);
  const [backup, setBackup] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await authClient.twoFactor.enable({ issuer: "The Physio Index", method: "totp" });
    setBusy(false);
    if (res.error || !res.data || res.data.method !== "totp") return setError("Could not start enrolment. Sign in again and retry.");
    setUri(res.data.totpURI);
    setBackup(res.data.backupCodes ?? []);
  }
  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (res.error) return setError("That code did not match. Scan the key again and enter the current code.");
    setDone(true);
    setTimeout(() => (window.location.href = "/admin"), 800);
  }
  const secret = uri ? new URL(uri).searchParams.get("secret") : null;
  return (
    <div className="card grid gap-4 p-6">
      {!uri ? (
        <>
          <p className="text-sm text-muted">Administrator accounts must use an authenticator app (IAM-03). Enrolment takes about a minute.</p>
          <button type="button" className="btn btn-primary" onClick={() => void start()} disabled={busy}>Start enrolment</button>
        </>
      ) : done ? (
        <p className="font-medium text-brand-ink">Authenticator enabled. Redirecting…</p>
      ) : (
        <>
          <ol className="grid gap-2 text-sm">
            <li>1. Open your authenticator app (Google Authenticator, 1Password, Authy).</li>
            <li>2. Add an account with this key:</li>
          </ol>
          <code className="select-all break-all rounded-[var(--r-sm)] bg-surface-2 p-3 text-sm">{secret}</code>
          <p className="text-xs text-muted">Or scan the key from this link in the app: <a className="underline" href={uri}>authenticator link</a></p>
          <div>
            <label className="label" htmlFor="confirm">3. Enter the current 6-digit code</label>
            <input id="confirm" className="input tracking-[0.3em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </div>
          {backup.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer">Backup codes (store securely, shown once)</summary>
              <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">{backup.map((b) => <li key={b}>{b}</li>)}</ul>
            </details>
          ) : null}
          {error ? <p role="alert" className="rounded-[var(--r-sm)] bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p> : null}
          <button type="button" className="btn btn-primary" onClick={() => void confirm()} disabled={busy || code.length !== 6}>Confirm and enable</button>
        </>
      )}
    </div>
  );
}
