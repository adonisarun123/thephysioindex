import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { Field, Input, Notice, Select, Textarea } from "@/components/admin/ui";
import type { SP } from "@/lib/admin/format";
import { SUPPORT_CATEGORIES } from "@/lib/admin/ops";
import { requireStaff } from "@/lib/auth/session";
import { createSupportAction } from "../../actions/ops";

export default function Page({ searchParams }: PageProps<"/admin/support/new">) {
  return (
    <>
      <PageHeader title="New support case" description="Record a request received by phone, email or in person. The case is assigned to you." />
      <Suspense fallback={null}>
        <Form searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/admin/support/new">["searchParams"] }) {
  const sp = (await searchParams) as SP;
  await connection();
  await requireStaff("support_agent");
  return (
    <>
      <Notice sp={sp} />
      <form action={createSupportAction} className="card grid max-w-2xl gap-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" name="category"><Select name="category" options={SUPPORT_CATEGORIES.map((c) => ({ value: c, label: c.replace(/_/g, " ") }))} /></Field>
          <Field label="Priority" name="priority"><Select name="priority" defaultValue="normal" options={["low", "normal", "high", "urgent"].map((p) => ({ value: p, label: p }))} /></Field>
        </div>
        <Field label="Requester contact (email or mobile, optional)" name="requesterContact"><Input name="requesterContact" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Linked record type" name="linkedType"><Select name="linkedType" options={[{ value: "", label: "None" }, { value: "practitioner", label: "Practitioner" }, { value: "booking", label: "Booking" }, { value: "review", label: "Review" }, { value: "clinic", label: "Clinic" }]} /></Field>
          <Field label="Linked record id" name="linkedId"><Input name="linkedId" placeholder="uuid" /></Field>
        </div>
        <Field label="Description" name="description"><Textarea name="description" required minLength={5} rows={5} /></Field>
        <div><button className="btn btn-primary" type="submit">Create case</button></div>
      </form>
    </>
  );
}
