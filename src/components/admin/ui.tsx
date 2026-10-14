import Link from "next/link";
import type { Viewer } from "@/lib/auth/session";
import { recentlyAuthenticated } from "@/lib/auth/session";
import { first, qs, titleCase, tone, type SP } from "@/lib/admin/format";

/** Small server-rendered primitives shared by admin pages. */

const TONE: Record<ReturnType<typeof tone>, string> = {
  ok: "bg-brand-soft text-brand-ink",
  warn: "bg-mark-soft text-ink-2",
  bad: "bg-alert-soft text-alert",
  muted: "bg-surface-2 text-muted",
  info: "bg-surface-2 text-ink-2",
};

export function Pill({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return <span className="text-muted">—</span>;
  return <span className={`pill ${TONE[tone(status)]}`}>{label ?? titleCase(status)}</span>;
}

export function Notice({ sp }: { sp: SP }) {
  const notice = first(sp.notice);
  const error = first(sp.error);
  if (!notice && !error) return null;
  return (
    <div role="status" className={`mb-4 rounded-[var(--r-sm)] border px-3 py-2 text-sm ${error ? "border-alert bg-alert-soft text-alert" : "border-brand bg-brand-soft text-brand-ink"}`}>
      {error ?? notice}
    </div>
  );
}

export function Table({ head, children, caption }: { head: React.ReactNode[]; children: React.ReactNode; caption?: string }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold text-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className="px-3 py-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "", colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2 align-top ${className}`}>
      {children}
    </td>
  );
}

export function Empty({ children = "Nothing here." }: { children?: React.ReactNode }) {
  return (
    <tr>
      <Td colSpan={99} className="py-8 text-center text-muted">
        {children}
      </Td>
    </tr>
  );
}

export function Field({ label, name, children, hint }: { label: string; name?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} id={props.id ?? props.name} className={`input ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} id={props.id ?? props.name} className={`input ${props.className ?? ""}`} rows={props.rows ?? 3} />;
}

export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...props} id={props.id ?? props.name} className={`input ${props.className ?? ""}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; count?: number }[]; current: string }) {
  return (
    <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-1 border-b border-line">
      {items.map((i) => {
        const active = i.label === current;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${active ? "border-brand font-semibold text-brand-ink" : "border-transparent text-ink-2 hover:text-brand-ink"}`}
          >
            {i.label}
            {i.count !== undefined ? <span className="ml-1 text-xs text-muted">{i.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Pager({ base, sp, page, pageSize, total }: { base: string; sp: SP; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) if (k !== "page" && k !== "notice" && k !== "error") flat[k] = first(v);
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-muted">
      <span>
        {total} record{total === 1 ? "" : "s"} · page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className="btn btn-quiet py-1" href={`${base}${qs({ ...flat, page: page - 1 })}`}>
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="btn btn-quiet py-1" href={`${base}${qs({ ...flat, page: page + 1 })}`}>
            Next
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function DL({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, children, actions, id }: { title: string; children: React.ReactNode; actions?: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="card mt-4 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Inline horizontal bar, no chart library. */
export function Bar({ value, max, label }: { value: number; max: number; label?: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <svg width="100%" height="10" role="img" aria-label={label ?? `${value} of ${max}`} className="block">
      <rect x="0" y="0" width="100%" height="10" rx="5" fill="var(--surface-2)" />
      <rect x="0" y="0" width={`${w}%`} height="10" rx="5" fill="var(--moss)" />
    </svg>
  );
}

/**
 * IAM-03: sensitive controls render only after a recent sign-in; otherwise a
 * link to re-authenticate and return here.
 */
export function Sensitive({ viewer, next, children }: { viewer: Viewer; next: string; children: React.ReactNode }) {
  if (recentlyAuthenticated(viewer)) return <>{children}</>;
  return (
    <p className="rounded-[var(--r-sm)] border border-line-strong bg-surface-2 px-3 py-2 text-sm">
      This action needs a recent sign-in.{" "}
      <Link className="font-semibold underline" href={`/admin/sign-in?next=${encodeURIComponent(next)}&reason=reauth`}>
        Sign in again to continue
      </Link>
    </p>
  );
}

export function Hidden({ name, value }: { name: string; value: string | number | null | undefined }) {
  return <input type="hidden" name={name} value={value ?? ""} />;
}

export function JsonView({ value }: { value: unknown }) {
  return <pre className="max-h-96 overflow-auto rounded-[var(--r-sm)] bg-surface-2 p-3 text-xs">{JSON.stringify(value ?? null, null, 2)}</pre>;
}
