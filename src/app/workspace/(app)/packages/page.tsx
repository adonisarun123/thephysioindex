import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Empty, Field, Notice, PageHeader, Section } from "@/components/workspace/forms/ui";
import { formatPaise } from "@/lib/money";
import { istToday } from "@/lib/practice/exercise-plans";
import { listSold, listTemplates, PAYMENT_MODES, perSessionPaise, type PackageFilter } from "@/lib/practice/packages";
import { requireWorkspace } from "@/lib/workspace/context";
import { readMessage } from "@/lib/workspace/forms";
import { createTemplateAction, packageAction, retireTemplateAction, sellAction } from "./actions";

export const metadata: Metadata = { title: "Packages" };

export default function Page({ searchParams }: PageProps<"/workspace/packages">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <Packages searchParams={searchParams} />
    </Suspense>
  );
}

const MODE_LABEL = Object.fromEntries(PAYMENT_MODES.map((m) => [m.key, m.label]));
const fmtDay = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/** PKG-01..04: package catalogue, sales, sessions used, balance due, expiry. Practice-side only; nothing here is public. */
async function Packages({ searchParams }: { searchParams: PageProps<"/workspace/packages">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const show: PackageFilter = sp.show === "closed" ? "closed" : "active";
  const { practitioner: p } = await requireWorkspace("/workspace/packages");
  const [templates, sold] = await Promise.all([listTemplates(p.id), listSold(p.id, show)]);
  const msg = readMessage(sp);
  const today = istToday();
  const due = sold.reduce((s, x) => s + (x.pricePaise - x.paidPaise), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Session packages" lede="Sell multi-session packages at your practice and keep track of sessions used, balance due and expiry. Packages are not shown on your public profile and online booking prices are unchanged." />
      <Notice ok={msg.ok} error={msg.error} />

      <Section
        title={show === "active" ? "Active packages" : "Closed packages"}
        lede={show === "active" && sold.length ? `${sold.length} active · ${formatPaise(due)} balance due` : undefined}
        aside={<Link href={show === "active" ? "/workspace/packages?show=closed" : "/workspace/packages"} className="text-sm underline">{show === "active" ? "Show closed" : "Show active"}</Link>}
      >
        {sold.length === 0 ? <Empty>{show === "active" ? "No packages sold yet." : "No closed packages."}</Empty> : (
          <ul className="grid gap-3">
            {sold.map((x) => {
              const left = x.sessionsTotal - x.used;
              const balance = x.pricePaise - x.paidPaise;
              return (
                <li key={x.id} className={`rounded-[var(--r-sm)] border p-4 text-sm ${x.expired && x.state === "active" ? "border-alert" : "border-line"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{x.patientLabel} · {x.name}</p>
                      <p className="text-muted">
                        {x.used}/{x.sessionsTotal} used · <span className={left === 0 ? "" : "font-semibold"}>{left} left</span>
                        {" · "}{x.expired ? <span className="font-semibold text-alert">expired {fmtDay(x.expiresOn)}</span> : `valid till ${fmtDay(x.expiresOn)}`}
                        {x.lastUsedOn ? ` · last session ${fmtDay(x.lastUsedOn)}` : ""}
                      </p>
                      <p className="text-muted">
                        {formatPaise(x.pricePaise)} · paid {formatPaise(x.paidPaise)}{x.paymentMode ? ` (${MODE_LABEL[x.paymentMode] ?? x.paymentMode})` : ""}
                        {balance > 0 ? <span className="font-semibold"> · {formatPaise(balance)} due</span> : " · fully paid"}
                      </p>
                      {x.note ? <p className="text-muted">Note: {x.note}</p> : null}
                    </div>
                    <div className="text-right">
                      <progress max={x.sessionsTotal} value={x.used} className="h-2 w-28" aria-label={`${x.used} of ${x.sessionsTotal} sessions used`} />
                    </div>
                  </div>

                  {/* Separate forms so Enter in one field never triggers another action (e.g. recording a session). */}
                  <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
                    {x.state === "active" && left > 0 && !x.expired ? (
                      <form action={packageAction} className="flex items-end gap-2">
                        <Hidden id={x.id} show={show} />
                        <label className="text-xs text-muted">Session date<input type="date" name="usedOn" className="input mt-0.5 py-1" defaultValue={today} max={today} /></label>
                        <button type="submit" name="op" value="use" className="btn btn-primary py-1.5 text-xs">Record session</button>
                      </form>
                    ) : null}
                    {x.state === "active" && balance > 0 ? (
                      <form action={packageAction} className="flex items-end gap-2">
                        <Hidden id={x.id} show={show} />
                        <input type="hidden" name="op" value="pay" />
                        <label className="text-xs text-muted">Received (₹)<input name="amountRupees" inputMode="decimal" className="input mt-0.5 py-1" style={{ width: "7rem" }} placeholder={String(balance / 100)} required /></label>
                        <select name="paymentMode" className="input py-1 text-xs" style={{ width: "auto" }} aria-label="Payment mode" defaultValue={x.paymentMode ?? "upi"}>
                          {PAYMENT_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                        </select>
                        <button type="submit" className="btn btn-secondary py-1.5 text-xs">Record payment</button>
                      </form>
                    ) : null}
                    {x.state === "active" ? (
                      <form action={packageAction} className="flex items-end gap-2">
                        <Hidden id={x.id} show={show} />
                        <input type="hidden" name="op" value="extend" />
                        <label className="text-xs text-muted">Extend (days)<input type="number" name="days" min={1} max={365} className="input mt-0.5 py-1" style={{ width: "5rem" }} placeholder="30" required /></label>
                        <button type="submit" className="btn btn-quiet py-1.5 text-xs">Extend</button>
                      </form>
                    ) : null}
                    <form action={packageAction} className="flex items-end gap-2">
                      <Hidden id={x.id} show={show} />
                      {x.state === "active" ? (
                        <>
                          {x.used > 0 ? <button type="submit" name="op" value="undo" className="btn btn-quiet py-1.5 text-xs">Undo last session</button> : null}
                          <button type="submit" name="op" value="close" className="btn btn-quiet py-1.5 text-xs">Close package</button>
                        </>
                      ) : (
                        <button type="submit" name="op" value="reopen" className="btn btn-quiet py-1.5 text-xs">Reopen</button>
                      )}
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section id="sell" title="Sell a package" lede="Use the patient's first name or initials only.">
        {templates.length === 0 ? <Empty>Add a package below first.</Empty> : (
          <form action={sellAction} className="grid gap-4 sm:grid-cols-2">
            <Field label="Package" htmlFor="templateId">
              <select id="templateId" name="templateId" className="input" required>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.sessions} sessions, {formatPaise(t.pricePaise)}</option>)}
              </select>
            </Field>
            <Field label="Patient (first name or initials)" htmlFor="patientLabel"><input id="patientLabel" name="patientLabel" className="input" required maxLength={40} placeholder="e.g. Meena S" /></Field>
            <Field label="Paid now (₹)" htmlFor="paidRupees" hint="Leave blank if nothing is paid yet."><input id="paidRupees" name="paidRupees" className="input" inputMode="decimal" /></Field>
            <Field label="Payment mode" htmlFor="paymentMode">
              <select id="paymentMode" name="paymentMode" className="input" defaultValue="upi">
                {PAYMENT_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Starts on" htmlFor="startsOn"><input id="startsOn" name="startsOn" type="date" className="input" defaultValue={today} /></Field>
            <Field label="Note (optional)" htmlFor="note"><input id="note" name="note" className="input" maxLength={500} /></Field>
            <div className="sm:col-span-2"><button type="submit" className="btn btn-primary">Sell package</button></div>
          </form>
        )}
      </Section>

      <Section id="catalogue" title="Your packages" lede="For example, “Knee rehab — 10 sessions”. Changing a price later does not change packages already sold.">
        {templates.length ? (
          <ul className="mb-5 divide-y divide-line border-y border-line text-sm">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <span><span className="font-medium">{t.name}</span> <span className="text-muted">· {t.sessions} sessions · {formatPaise(t.pricePaise)} ({formatPaise(perSessionPaise(t.pricePaise, t.sessions))}/session) · valid {t.validityDays} days · sold {t.sold}</span></span>
                <form action={retireTemplateAction}><input type="hidden" name="templateId" value={t.id} /><button type="submit" className="btn btn-quiet py-1 text-xs">Stop selling</button></form>
              </li>
            ))}
          </ul>
        ) : null}
        <form action={createTemplateAction} className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-4"><Field label="Name" htmlFor="name"><input id="name" name="name" className="input" required minLength={3} maxLength={80} placeholder="e.g. Back pain programme — 10 sessions" /></Field></div>
          <Field label="Sessions" htmlFor="sessions"><input id="sessions" name="sessions" type="number" min={2} max={100} className="input" required defaultValue={10} /></Field>
          <Field label="Price (₹)" htmlFor="priceRupees"><input id="priceRupees" name="priceRupees" className="input" inputMode="decimal" required /></Field>
          <Field label="Valid for (days)" htmlFor="validityDays"><input id="validityDays" name="validityDays" type="number" min={7} max={730} className="input" required defaultValue={60} /></Field>
          <div className="flex items-end"><button type="submit" className="btn btn-secondary">Add package</button></div>
        </form>
      </Section>
    </div>
  );
}

function Hidden({ id, show }: { id: string; show: string }) {
  return (
    <>
      <input type="hidden" name="packageId" value={id} />
      <input type="hidden" name="show" value={show} />
    </>
  );
}
