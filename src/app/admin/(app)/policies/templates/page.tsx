import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Empty, Field, Hidden, Input, Notice, Pill, Section, Select, Table, Td, Textarea } from "@/components/admin/ui";
import { fmtDateTime, type SP } from "@/lib/admin/format";
import { listTemplates, type TemplateRow } from "@/lib/admin/master";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { upsertTemplateAction } from "../../actions/master";

export default function Page({ searchParams }: PageProps<"/admin/policies/templates">) {
  return (
    <>
      <PageHeader title="Notification templates" description="Transactional message templates per event, channel and language (Section 13). Changing the text creates a new version; the previous one is deactivated and kept." actions={<Link href="/admin/policies" className="btn btn-quiet py-1.5">Policies</Link>} />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const CHANNELS = ["sms", "email", "in_app", "whatsapp"];

async function Body({ searchParams }: { searchParams: PageProps<"/admin/policies/templates">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  const v = await requireStaff();
  const templates = await listTemplates();
  const isSuper = hasRole(v, "super_admin");
  return (
    <>
      <Notice sp={sp} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Table head={["Event", "Channel", "Lang", "v", "Active", "Subject / body", "Provider id", "Updated", isSuper ? "Edit" : ""]}>
          {templates.length === 0 ? <Empty>No templates.</Empty> : null}
          {templates.map((t) => (
            <tr key={t.id} className={t.active ? "" : "opacity-60"}>
              <Td><code className="text-xs">{t.eventType}</code></Td><Td>{t.channel.replace("_", " ")}</Td><Td>{t.language}</Td><Td>{t.version}</Td>
              <Td><Pill status={t.active ? "active" : "inactive"} /></Td>
              <Td className="max-w-md text-xs">{t.subject ? <div className="font-semibold">{t.subject}</div> : null}<div className="whitespace-pre-wrap">{t.body}</div></Td>
              <Td className="text-xs">{t.providerTemplateId ?? "—"}</Td>
              <Td className="text-xs">{fmtDateTime(t.updatedAt)}</Td>
              <Td>{isSuper ? <details><summary className="cursor-pointer text-sm underline">Edit</summary><TemplateForm t={t} /></details> : null}</Td>
            </tr>
          ))}
        </Table>
        {isSuper ? <Section title="New template"><TemplateForm /></Section> : null}
      </div>
    </>
  );
}

function TemplateForm({ t }: { t?: TemplateRow }) {
  const k = t?.id ?? "new";
  return (
    <form action={upsertTemplateAction} className="mt-2 grid gap-2 text-sm">
      {t ? <Hidden name="id" value={t.id} /> : null}
      <Field label="Event type" name={`ev-${k}`}><Input id={`ev-${k}`} name="eventType" required defaultValue={t?.eventType ?? ""} readOnly={Boolean(t)} placeholder="booking.confirmed" /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Channel" name={`ch-${k}`}><Select id={`ch-${k}`} name="channel" defaultValue={t?.channel ?? "sms"} options={CHANNELS.map((c) => ({ value: c, label: c.replace("_", " ") }))} /></Field>
        <Field label="Language" name={`lg-${k}`}><Input id={`lg-${k}`} name="language" defaultValue={t?.language ?? "en"} /></Field>
      </div>
      <Field label="Subject (email)" name={`sb-${k}`}><Input id={`sb-${k}`} name="subject" defaultValue={t?.subject ?? ""} /></Field>
      <Field label="Body ({{placeholders}})" name={`bd-${k}`}><Textarea id={`bd-${k}`} name="body" required rows={4} defaultValue={t?.body ?? ""} /></Field>
      <Field label="Provider template id (e.g. DLT)" name={`pt-${k}`}><Input id={`pt-${k}`} name="providerTemplateId" defaultValue={t?.providerTemplateId ?? ""} /></Field>
      <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={t?.active ?? true} /> Active</label>
      <Field label="Reason" name={`rs-${k}`}><Input id={`rs-${k}`} name="reason" required /></Field>
      <button className={`btn py-1.5 ${t ? "btn-secondary" : "btn-primary"}`} type="submit">{t ? "Save (new version if text changed)" : "Create"}</button>
    </form>
  );
}
