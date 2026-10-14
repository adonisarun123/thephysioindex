"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { AdminArticle } from "@/lib/content/admin";
import { STATUS_LABEL } from "@/lib/content/constants";
import { editorAction, type EditorState } from "@/lib/content/actions";
import type { Kind } from "@/lib/content/schemas";
import { slugify } from "@/lib/slug";
import { FaqRows, Field, PractitionerPicker, SourceRows } from "./editor-fields";

/**
 * Content editor form (SEO-04). All validation and authorisation happen in
 * the server action; this component only collects input and shows state.
 * Scalar fields are controlled so a validation error never wipes the form.
 */

type Props = { kind: Kind; article: AdminArticle | null; specialties: { id: string; label: string }[]; previewHref: string; notice?: string };

const EMPTY: EditorState = { ok: true, message: null };

export function ContentEditor({ kind, article, specialties, previewHref, notice }: Props) {
  const [state, action, pending] = useActionState(editorAction.bind(null, kind, article?.id ?? null), EMPTY);
  const [title, setTitle] = useState(article?.title ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(article?.slug));
  const status = article?.status ?? "draft";
  const e = state.fieldErrors ?? {};
  const cond = article?.condition ?? {};
  const joinLines = (a?: string[]) => (a ?? []).join("\n");
  const isNew = !article;
  const nestedError = (prefix: string, label: string) => {
    const k = Object.keys(e).find((key) => key.startsWith(`${prefix}.`));
    if (!k) return e[prefix];
    const idx = Number(k.split(".")[1]);
    return `${label} ${Number.isFinite(idx) ? idx + 1 : ""}: ${e[k]}`;
  };

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="grid gap-5">
        {state.message ? (
          <p role="status" className={`rounded-[var(--r-sm)] px-3 py-2 text-sm ${state.ok ? "bg-brand-soft text-brand-ink" : "bg-alert-soft text-alert"}`}>{state.message}</p>
        ) : notice ? (
          <p role="status" className="rounded-[var(--r-sm)] bg-brand-soft px-3 py-2 text-sm text-brand-ink">{notice}</p>
        ) : null}

        <Field label="Title" error={e.title}>
          <input name="title" className="input" required value={title} onChange={(ev) => { setTitle(ev.target.value); if (!slugTouched) setSlug(slugify(ev.target.value)); }} />
        </Field>
        <Field label="Slug" hint={`Public URL: /${kind === "blog" ? "blog" : kind === "condition" ? "conditions" : "news"}/${slug || "…"}`} error={e.slug}>
          <input name="slug" className="input font-mono text-sm" value={slug} onChange={(ev) => { setSlugTouched(true); setSlug(ev.target.value); }} onBlur={() => setSlug(slugify(slug))} />
        </Field>
        <Field label="Dek (standfirst, also the meta description)" hint="One or two sentences, under 320 characters." error={e.dek}>
          <textarea name="dek" className="input min-h-16" defaultValue={article?.dek ?? ""} maxLength={320} />
        </Field>
        <Field label="Body (Markdown)" hint="Use ## for sections; # is reserved for the title. Raw HTML is dropped. External links become nofollow." error={e.bodyMarkdown}>
          <textarea name="body" className="input min-h-[28rem] font-mono text-sm" defaultValue={article?.bodyMarkdown ?? ""} />
        </Field>

        {kind === "condition" ? (
          <fieldset className="card grid gap-4 p-4">
            <legend className="px-1 text-sm font-semibold">Condition summary (one item per line)</legend>
            <Field label="Also known as"><textarea name="cond_also" className="input min-h-14" defaultValue={joinLines(cond.alsoKnownAs)} /></Field>
            <Field label="Common symptoms"><textarea name="cond_symptoms" className="input min-h-20" defaultValue={joinLines(cond.symptoms)} /></Field>
            <Field label="Common causes and risk factors"><textarea name="cond_causes" className="input min-h-20" defaultValue={joinLines(cond.commonCauses)} /></Field>
            <Field label="When to see a physiotherapist"><textarea name="cond_when" className="input min-h-20" defaultValue={joinLines(cond.whenToSeek)} /></Field>
            <Field label="How physiotherapy helps"><textarea name="cond_helps" className="input min-h-20" defaultValue={joinLines(cond.physiotherapyHelps)} /></Field>
            <Field label="Condition-specific red flags" hint="Generic urgent-care flags are always shown; add only what is specific to this condition."><textarea name="cond_redflags" className="input min-h-20" defaultValue={joinLines(cond.redFlags)} /></Field>
            <Field label="Body area"><input name="cond_body_area" className="input" defaultValue={cond.bodyArea ?? ""} /></Field>
          </fieldset>
        ) : null}

        <Field label="FAQs" hint="Rendered as an accessible list and FAQPage JSON-LD." error={nestedError("faqs", "FAQ")}>
          <FaqRows initial={article?.faqs ?? []} />
        </Field>
        <Field label="Sources" hint="Cite guidelines and peer-reviewed sources. Required for clinical claims." error={nestedError("sources", "Source")}>
          <SourceRows initial={article?.sources ?? []} />
        </Field>
      </div>

      <aside className="grid gap-5 lg:sticky lg:top-4 lg:self-start">
        <div className="card grid gap-3 p-4">
          <p className="flex items-center justify-between text-sm">
            <span className="font-semibold">Status</span>
            <span className="pill bg-surface-2">{STATUS_LABEL[status]}</span>
          </p>
          {article?.publishedAt ? <p className="text-xs text-muted">Published {new Date(article.publishedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p> : null}
          {article ? <p className="text-xs text-muted">Revision {article.revisionNo} · updated {new Date(article.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p> : null}
          {article?.decisionReason ? <p className="text-xs text-alert">Reason: {article.decisionReason}</p> : null}
          {status === "published" ? (
            <p className="text-xs text-muted">
              Live. Saving editorial changes {kind === "condition" ? "sends the page back to review and takes it offline until re-approved" : "removes the clinical-review attribution until re-approved"} (SEO-04).
            </p>
          ) : null}
          <div className="grid gap-2">
            <button type="submit" name="intent" value="save" className="btn btn-secondary py-2" disabled={pending}>{isNew ? "Create draft" : "Save"}</button>
            {status !== "published" ? <button type="submit" name="intent" value="submit" className="btn btn-quiet py-2" disabled={pending}>Submit for review</button> : null}
            <button type="submit" name="intent" value="publish" className="btn btn-primary py-2" disabled={pending}>{status === "published" ? "Save and republish" : "Approve and publish"}</button>
            {status === "published" ? <button type="submit" name="intent" value="withdraw" className="btn btn-quiet py-2" disabled={pending}>Withdraw</button> : null}
            {status === "in_review" ? <button type="submit" name="intent" value="reject" className="btn btn-quiet py-2 text-alert" disabled={pending}>Reject</button> : null}
            {status === "withdrawn" || status === "rejected" ? <button type="submit" name="intent" value="restore" className="btn btn-quiet py-2" disabled={pending}>Restore to draft</button> : null}
          </div>
          {article ? (
            <p className="text-xs">
              <Link href={previewHref} className="underline">Preview saved body</Link>
              {status === "published" ? (
                <>
                  {" · "}
                  <a href={`/${kind === "blog" ? "blog" : kind === "condition" ? "conditions" : "news"}/${article.slug}`} target="_blank" rel="noopener" className="underline">View live</a>
                </>
              ) : null}
            </p>
          ) : null}
          <Field label="Decision reason (reject / withdraw)" error={e.decisionReason}>
            <textarea name="decision_reason" className="input min-h-14 text-sm" placeholder="Required when rejecting" />
          </Field>
        </div>

        <div className="card grid gap-3 p-4">
          <p className="text-sm font-semibold">Clinical review (SEO-04)</p>
          <p className="text-xs text-muted">{kind === "condition" ? "Required before a condition page can be published." : "Optional. Without it the page shows “Not yet clinically reviewed”."}</p>
          <Field label="Reviewer name" error={e.reviewerName}><input name="reviewer_name" className="input py-1.5" defaultValue={article?.reviewerName ?? ""} /></Field>
          <Field label="Reviewer credential" hint="e.g. MPT (Ortho), KSAHC reg. KA/PT/…" error={e.reviewerCredential}><input name="reviewer_credential" className="input py-1.5" defaultValue={article?.reviewerCredential ?? ""} /></Field>
          {article?.reviewedAt ? <p className="text-xs text-muted">Last reviewed {new Date(article.reviewedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p> : null}
        </div>

        <div className="card grid gap-3 p-4">
          <p className="text-sm font-semibold">Attribution and classification</p>
          <Field label="Author name" hint="Shown when no practitioner is linked." error={e.authorName}><input name="author_name" className="input py-1.5" defaultValue={article?.authorName ?? ""} /></Field>
          <Field label="Author practitioner"><PractitionerPicker initialId={article?.authorPractitionerId ?? null} initialName={article?.authorPractitionerName ?? null} /></Field>
          <Field label="Primary specialty" error={e.primarySpecialtyId}>
            <select name="primary_specialty_id" className="input py-1.5" defaultValue={article?.primarySpecialtyId ?? ""}>
              <option value="">None</option>
              {specialties.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Tags (comma separated)" error={e.tags}><input name="tags" className="input py-1.5" defaultValue={(article?.tags ?? []).join(", ")} /></Field>
          {kind === "news" ? (
            <Field label="News category" hint="e.g. Regulation, Platform, Research" error={e.newsCategory}><input name="news_category" className="input py-1.5" defaultValue={article?.newsCategory ?? ""} /></Field>
          ) : null}
          <Field label="Cover image alt text" error={e.coverAlt}><input name="cover_alt" className="input py-1.5" defaultValue={article?.coverAlt ?? ""} /></Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="noindex" defaultChecked={article?.noindex ?? false} /> Keep out of search engines (noindex)
          </label>
        </div>

        {kind === "news" && article ? (
          <div className="card grid gap-3 p-4">
            <p className="text-sm font-semibold">Correction</p>
            {article.correction ? <p className="text-xs text-muted">Current: “{article.correction}”{article.correctedAt ? ` (${new Date(article.correctedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })})` : ""}</p> : null}
            <Field label="Correction notice" error={e.correction}><textarea name="correction" className="input min-h-16 text-sm" defaultValue={article.correction ?? ""} /></Field>
            <button type="submit" name="intent" value="correct" className="btn btn-quiet py-2" disabled={pending}>Add correction</button>
          </div>
        ) : null}
      </aside>
    </form>
  );
}
