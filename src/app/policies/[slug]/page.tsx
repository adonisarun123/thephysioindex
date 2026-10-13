import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { policies } from "@/db/schema";

const SLUGS = { privacy: "privacy_notice", terms: "patient_terms", "provider-terms": "provider_terms", cancellation: "cancellation" } as const;

export async function generateMetadata({ params }: PageProps<"/policies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const titles: Record<string, string> = { privacy: "Privacy notice", terms: "Terms", "provider-terms": "Provider terms", cancellation: "Cancellation policy" };
  return { title: titles[slug] ?? "Policy", alternates: { canonical: `/policies/${slug}` } };
}

export default function Page({ params }: PageProps<"/policies/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-10 text-muted">Loading…</div>}>
      <Policy params={params} />
    </Suspense>
  );
}

async function Policy({ params }: { params: PageProps<"/policies/[slug]">["params"] }) {
  const { slug } = await params;
  const type = SLUGS[slug as keyof typeof SLUGS];
  if (!type) notFound();
  await connection();
  const [row] = await db()
    .select()
    .from(policies)
    .where(and(eq(policies.type, type), eq(policies.key, "default")))
    .orderBy(desc(policies.effectiveAt))
    .limit(1);
  if (!row) notFound();
  const draft = (row.content as { status?: string }).status === "draft";
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{row.title}</h1>
      <p className="mt-1 text-sm text-muted">Version {row.version} · effective {row.effectiveAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
      {draft ? (
        <p className="mt-4 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">This is a draft pending review by qualified Indian counsel. It is published for transparency and is not yet final.</p>
      ) : null}
      <div className="prose mt-6 whitespace-pre-wrap">{row.bodyMarkdown ?? "Full text to follow."}</div>
    </div>
  );
}
