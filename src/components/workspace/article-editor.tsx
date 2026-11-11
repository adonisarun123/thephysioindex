"use client";

import { useMemo, useState } from "react";
import { ARTICLE_RULES, checkArticle } from "@/lib/workspace/article-checks";

type Faq = { question: string; answer: string };
type Source = { title: string; url: string };

export type ArticleEditorProps = {
  initial: { title: string; summary: string; body: string; audience: "patients" | "physiotherapists"; primarySpecialtyId: string | null; faqs: Faq[]; sources: Source[] };
  specialties: { id: string; label: string }[];
  canSubmit: boolean;
  cannotSubmitReason?: string;
};

const pad = <T,>(rows: T[], n: number, blank: T): T[] => [...rows, ...Array.from({ length: Math.max(0, n - rows.length) }, () => blank)];

/**
 * Article form with live publishing checks (SEO-04). The checks are the same
 * function the server runs on submit; this only saves the author a round trip.
 * The two submit buttons post the surrounding <form> with `intent`.
 */
export function ArticleEditor({ initial, specialties, canSubmit, cannotSubmitReason }: ArticleEditorProps) {
  const [title, setTitle] = useState(initial.title);
  const [summary, setSummary] = useState(initial.summary);
  const [body, setBody] = useState(initial.body);
  const [faqs, setFaqs] = useState<Faq[]>(pad(initial.faqs, 4, { question: "", answer: "" }));
  const [declared, setDeclared] = useState(false);

  const faqCount = faqs.filter((f) => f.question.trim().length >= 5 && f.answer.trim().length >= 20).length;
  const checks = useMemo(() => checkArticle({ title, summary, body, faqCount }), [title, summary, body, faqCount]);
  const passed = checks.filter((c) => c.ok).length;
  const ready = passed === checks.length;
  const sources = pad(initial.sources, 3, { title: "", url: "" });

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_19rem]">
      <div className="grid gap-5">
        <div className="card grid gap-4 p-5">
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input id="title" name="title" className="input" maxLength={120} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Frozen shoulder: how long does recovery take?" />
            <p className="mt-1 text-xs text-muted">{title.trim().length}/{ARTICLE_RULES.titleMax} characters. Use the words a patient would type into Google.</p>
          </div>
          <div>
            <label className="label" htmlFor="summary">Summary</label>
            <textarea id="summary" name="summary" className="input min-h-20" maxLength={320} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Answer the title's question in one or two sentences." />
            <p className="mt-1 text-xs text-muted">{summary.trim().length} characters (aim for {ARTICLE_RULES.summaryMin}–{ARTICLE_RULES.summaryMax}). Shown under the title in search results and at the top of the article.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="audience">Written for</label>
              <select id="audience" name="audience" className="input" defaultValue={initial.audience}>
                <option value="patients">Patients</option>
                <option value="physiotherapists">Other physiotherapists</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="primarySpecialtyId">Area of practice</label>
              <select id="primarySpecialtyId" name="primarySpecialtyId" className="input" defaultValue={initial.primarySpecialtyId ?? ""}>
                <option value="">General</option>
                {specialties.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <label className="label" htmlFor="body">Article</label>
          <textarea id="body" name="body" className="input min-h-[28rem] font-mono text-sm leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} placeholder={"## What is frozen shoulder?\n\nWrite in plain language, as you would explain it to a patient…\n\n## How long does recovery take?\n\n…"} />
          <p className="mt-2 text-xs text-muted">
            Start a section with <code>## </code> and a heading. Leave a blank line between paragraphs. <code>- </code> starts a bullet, <code>**bold**</code> makes bold text. Do not paste text from other websites: copied articles are rejected.
          </p>
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-semibold">Questions patients ask</h2>
          <p className="mt-1 text-sm text-muted">Short questions with direct answers. Search engines and AI assistants show these as answers, with your name on them. At least {ARTICLE_RULES.minFaqs}.</p>
          <div className="mt-4 grid gap-4">
            {faqs.map((f, i) => (
              <div key={i} className="grid gap-2">
                <label className="sr-only" htmlFor={`faq_q_${i}`}>Question {i + 1}</label>
                <input id={`faq_q_${i}`} name="faq_q" className="input" maxLength={200} placeholder={`Question ${i + 1}`} value={f.question} onChange={(e) => setFaqs((cur) => cur.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))} />
                <label className="sr-only" htmlFor={`faq_a_${i}`}>Answer {i + 1}</label>
                <textarea id={`faq_a_${i}`} name="faq_a" className="input min-h-16" maxLength={1200} placeholder="Answer in two or three sentences" value={f.answer} onChange={(e) => setFaqs((cur) => cur.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} />
              </div>
            ))}
          </div>
          {faqs.length < ARTICLE_RULES.maxFaqs ? (
            <button type="button" className="btn btn-quiet mt-3 py-1.5 text-sm" onClick={() => setFaqs((cur) => [...cur, { question: "", answer: "" }])}>Add another question</button>
          ) : null}
        </div>

        <div className="card p-5">
          <h2 className="text-lg font-semibold">Sources (optional)</h2>
          <p className="mt-1 text-sm text-muted">Guidelines or studies you relied on. Articles with sources are approved faster.</p>
          <div className="mt-4 grid gap-3">
            {sources.map((s, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-2">
                <input name="src_title" aria-label={`Source ${i + 1} title`} className="input" maxLength={200} placeholder="Title of the guideline or study" defaultValue={s.title} />
                <input name="src_url" aria-label={`Source ${i + 1} link`} className="input" type="url" placeholder="https://…" defaultValue={s.url} />
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="declared" className="mt-1" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
            <span>I wrote this myself. It is not copied from another website or book, it does not name or describe an identifiable patient, and it does not promise a treatment result.</span>
          </label>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="submit" name="intent" value="save" className="btn btn-secondary">Save draft</button>
            <button type="submit" name="intent" value="submit" className="btn btn-primary" disabled={!canSubmit || !ready || !declared}>Send for review</button>
          </div>
          <p className="mt-2 text-xs text-muted">
            {!canSubmit ? cannotSubmitReason : !ready ? "Complete the checklist to send this for review." : !declared ? "Tick the declaration to send this for review." : "Our team reads every article before it goes live. You will see the result here."}
          </p>
        </div>
      </div>

      <aside className="self-start card p-5 lg:sticky lg:top-4" aria-live="polite">
        <h2 className="font-semibold">Publishing checklist</h2>
        <p className="mt-1 text-sm text-muted">{passed} of {checks.length} done</p>
        <ul className="mt-3 grid gap-3 text-sm">
          {checks.map((c) => (
            <li key={c.key} className="flex gap-2">
              <span aria-hidden className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${c.ok ? "bg-brand text-white" : "bg-surface-2 text-muted"}`}>{c.ok ? "✓" : "·"}</span>
              <span>
                <span className={c.ok ? "" : "font-medium"}>{c.label}</span>
                <span className="sr-only">{c.ok ? " (done)" : " (to do)"}</span>
                <span className="block text-xs text-muted">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
