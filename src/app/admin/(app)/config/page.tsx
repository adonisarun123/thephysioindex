import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { Empty, Hidden, Input, Notice, Pill, Section, Table, Td, Textarea } from "@/components/admin/ui";
import { fmtDateTime, type SP } from "@/lib/admin/format";
import { listConfig, listFlags } from "@/lib/admin/master";
import { requireStaff } from "@/lib/auth/session";
import { toggleFlagAction, updateConfigAction } from "../actions/master";

export default function Page({ searchParams }: PageProps<"/admin/config">) {
  return (
    <>
      <PageHeader title="Configuration and flags" description="Proposed SRS defaults live here as rows, read at runtime. Every change records history with a reason (ADM-05, OPS-03)." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/admin/config">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff("super_admin");
  const [config, flags] = await Promise.all([listConfig(), listFlags()]);
  return (
    <>
      <Notice sp={sp} />
      <Section id="flags" title="Feature flags">
        <Table head={["Flag", "Description", "Owner", "State", "Last change", "Toggle"]}>
          {flags.length === 0 ? <Empty>No flags.</Empty> : null}
          {flags.map((f) => (
            <tr key={f.key}>
              <Td><code className="text-xs">{f.key}</code></Td>
              <Td className="text-xs">{f.description}</Td>
              <Td className="text-xs">{f.owner ?? "—"}</Td>
              <Td><Pill status={f.enabled ? "active" : "inactive"} label={f.enabled ? "On" : "Off"} /></Td>
              <Td className="text-xs">{f.lastEvent ? <>{fmtDateTime(f.lastEvent.occurredAt)} by {f.lastEvent.actor ?? "seed"}<div className="text-muted">{f.lastEvent.reason}</div></> : "—"}</Td>
              <Td>
                <form action={toggleFlagAction} className="flex gap-1">
                  <Hidden name="key" value={f.key} /><Hidden name="enabled" value={f.enabled ? "false" : "true"} />
                  <Input name="reason" required placeholder="Reason" aria-label={`Reason for toggling ${f.key}`} className="w-48 py-1" />
                  <ConfirmButton message={`${f.enabled ? "Disable" : "Enable"} ${f.key}? This takes effect on the next request.`} className="btn btn-quiet py-1">{f.enabled ? "Disable" : "Enable"}</ConfirmButton>
                </form>
              </Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Platform configuration">
        <Table head={["Key", "SRS", "Description", "Value (JSON)", "Updated", "History"]}>
          {config.length === 0 ? <Empty>No configuration rows.</Empty> : null}
          {config.map((c) => (
            <tr key={c.key} id={`cfg-${c.key}`}>
              <Td><code className="text-xs">{c.key}</code></Td>
              <Td className="text-xs text-muted">{c.srsRef ?? "—"}</Td>
              <Td className="max-w-xs text-xs">{c.description}</Td>
              <Td>
                <form action={updateConfigAction} className="grid w-72 gap-1">
                  <Hidden name="key" value={c.key} />
                  <Textarea name="value" aria-label={`Value for ${c.key}`} rows={2} defaultValue={JSON.stringify(c.value)} className="font-mono text-xs" />
                  <Input name="reason" required placeholder="Reason" aria-label={`Reason for changing ${c.key}`} className="py-1 text-xs" />
                  <button className="btn btn-quiet py-1 text-xs" type="submit">Save</button>
                </form>
              </Td>
              <Td className="text-xs">{fmtDateTime(c.updatedAt)}{c.updatedBy ? <div className="text-muted">{c.updatedBy}</div> : null}</Td>
              <Td className="text-xs">
                {c.history.length === 0 ? <span className="text-muted">—</span> : (
                  <details><summary className="cursor-pointer underline">{c.history.length} change(s)</summary>
                    <ul className="mt-1">{c.history.map((h, i) => <li key={i} className="border-t border-line py-1">{fmtDateTime(h.occurredAt)} · {h.actor ?? "system"}<div><code>{JSON.stringify(h.previousValue)}</code> → <code>{JSON.stringify(h.newValue)}</code></div><div className="text-muted">{h.reason}</div></li>)}</ul>
                  </details>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
