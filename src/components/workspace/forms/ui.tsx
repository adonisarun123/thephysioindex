import Link from "next/link";

/** Small server-rendered form primitives for the workspace (design tokens from globals.css). */

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <div className="mt-4 grid gap-2">
      {ok ? <p className="card border-brand bg-brand-soft p-3 text-sm" role="status">{ok}</p> : null}
      {error ? <p className="card border-alert bg-alert-soft p-3 text-sm" role="alert">{error}</p> : null}
    </div>
  );
}

export function PageHeader({ title, lede, action }: { title: string; lede?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {lede ? <p className="mt-1 text-sm text-muted">{lede}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Section({ id, title, lede, children, aside }: { id?: string; title: string; lede?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={id} className="card mt-6 scroll-mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {lede ? <p className="mt-1 text-sm text-muted">{lede}</p> : null}
        </div>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[var(--r-sm)] border border-dashed border-line-strong p-4 text-sm text-muted">{children}</p>;
}

export function StatePill({ state }: { state: string }) {
  const tone =
    ["approved", "published", "active", "accepted", "confirmed", "completed", "registration_checked"].includes(state)
      ? "bg-brand-soft text-brand-ink"
      : ["rejected", "ended", "revoked", "expired", "suspended", "declined"].includes(state)
        ? "bg-alert-soft text-ink-2"
        : "bg-mark-soft text-ink-2";
  return <span className={`pill ${tone}`}>{state.replace(/_/g, " ")}</span>;
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-sm underline">{children}</Link>;
}

export function Select({ id, name, options, value, placeholder, required }: { id: string; name: string; options: { id: string; label: string; hint?: string | null }[]; value?: string; placeholder?: string; required?: boolean }) {
  return (
    <select id={id} name={name} className="input" defaultValue={value ?? ""} required={required}>
      <option value="">{placeholder ?? "Select…"}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.label}</option>
      ))}
    </select>
  );
}
