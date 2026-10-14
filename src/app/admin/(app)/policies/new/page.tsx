import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Field, Input, Notice, Select, Textarea } from "@/components/admin/ui";
import { first, type SP } from "@/lib/admin/format";
import { listPolicies } from "@/lib/admin/master";
import { geoOptions } from "@/lib/admin/practitioners";
import { requireStaff } from "@/lib/auth/session";
import { createPolicyVersionAction } from "../../actions/master";

export default function Page({ searchParams }: PageProps<"/admin/policies/new">) {
  return (
    <>
      <PageHeader title="New policy version" description="Creates a new, immutable version. If the effective date is now or past, the current version of the same type and key is superseded immediately; a future date schedules it." />
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const TYPES = ["cancellation", "provider_terms", "patient_terms", "privacy_notice", "jurisdiction", "ranking", "offer_terms"];

async function Form({ searchParams }: { searchParams: PageProps<"/admin/policies/new">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff("super_admin");
  const [policies, geo] = await Promise.all([listPolicies(), geoOptions()]);
  const fromId = first(sp.from);
  const base = policies.find((p) => p.id === fromId) ?? null;
  const keys = Array.from(new Set(policies.map((p) => `${p.type}/${p.key}`)));
  return (
    <>
      <Notice sp={sp} />
      <form action={createPolicyVersionAction} className="card grid max-w-3xl gap-3 p-4">
        <p className="text-xs text-muted">Existing keys: {keys.join(", ") || "none"}. Reusing a type and key creates the next version of that policy.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type" name="type"><Select name="type" defaultValue={base?.type ?? "cancellation"} options={TYPES.map((t) => ({ value: t, label: t.replace("_", " ") }))} /></Field>
          <Field label="Key" name="key"><Input name="key" required pattern="[a-z0-9\-]{2,60}" defaultValue={base?.key ?? "default"} /></Field>
          <Field label="Version label" name="version"><Input name="version" required pattern="[a-zA-Z0-9.\-]{2,40}" placeholder="e.g. 2026-11" /></Field>
        </div>
        <Field label="Title" name="title"><Input name="title" required defaultValue={base?.title ?? ""} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="State scope (jurisdiction policies only)" name="stateId"><Select name="stateId" defaultValue={base?.stateId ?? ""} options={[{ value: "", label: "Global" }, ...geo.states.map((s) => ({ value: s.id, label: s.name }))]} /></Field>
          <Field label="Effective at (IST)" name="effectiveAt" hint="Leave blank for now."><Input name="effectiveAt" type="datetime-local" /></Field>
        </div>
        <Field label="Content JSON (machine-readable rules)" name="content"><Textarea name="content" required rows={8} defaultValue={JSON.stringify(base?.content ?? {}, null, 2)} className="font-mono text-xs" /></Field>
        <Field label="Body (Markdown shown to users)" name="bodyMarkdown"><Textarea name="bodyMarkdown" rows={10} defaultValue={base?.bodyMarkdown ?? ""} /></Field>
        <Field label="Reason for the new version" name="reason"><Textarea name="reason" required rows={2} /></Field>
        <div><button className="btn btn-primary" type="submit">Create version</button></div>
      </form>
    </>
  );
}
