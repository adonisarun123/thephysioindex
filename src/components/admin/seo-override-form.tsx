"use client";

import { useActionState } from "react";
import { setOverrideAction, type OverrideState } from "@/lib/seo/actions";
import { Field } from "./editor-fields";

/** Per-path indexation override form (SEO-02). Authorisation and validation happen in the server action. */
export function SeoOverrideForm({ initialPath }: { initialPath?: string }) {
  const [state, action, pending] = useActionState<OverrideState, FormData>(setOverrideAction, { ok: true, message: null });
  return (
    <form action={action} className="card grid gap-3 p-4">
      <p className="text-sm font-semibold">Set an override</p>
      {state.message ? <p role="status" className={`rounded-[var(--r-sm)] px-3 py-2 text-sm ${state.ok ? "bg-brand-soft text-brand-ink" : "bg-alert-soft text-alert"}`}>{state.message}</p> : null}
      <Field label="Path" hint="Exact path, e.g. /physiotherapists/karnataka/bengaluru">
        <input name="path" className="input py-1.5 font-mono text-sm" required defaultValue={initialPath ?? ""} placeholder="/…" />
      </Field>
      <Field label="Directive">
        <select name="directive" className="input py-1.5" defaultValue="force_noindex">
          <option value="force_noindex">Force noindex</option>
          <option value="force_index">Force index</option>
        </select>
      </Field>
      <Field label="Reason" hint="Recorded in the audit log.">
        <input name="reason" className="input py-1.5" required minLength={5} placeholder="Why this path should deviate from the default" />
      </Field>
      <Field label="Expires (optional)">
        <input name="expires_at" type="datetime-local" className="input py-1.5" />
      </Field>
      <button type="submit" className="btn btn-primary py-2" disabled={pending}>{pending ? "Saving…" : "Save override"}</button>
    </form>
  );
}
