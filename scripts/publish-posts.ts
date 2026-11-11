/**
 * Publishes blog posts kept in the repo (content/posts/*.md) on every build,
 * production included (SEO-01, SEO-04). The weekly content run adds files via
 * a pull request; merging it is the publishing approval.
 *
 * Rules:
 *  - Upsert by (kind 'blog', slug). Unchanged files are a no-op.
 *  - A post whose publishOn date (IST) is in the future stays a draft until a
 *    later build on or after that date.
 *  - A post withdrawn or rejected in Admin stays withdrawn/rejected: the repo
 *    never resurrects it.
 *  - No reviewer fields are written, so pages show "Not yet clinically
 *    reviewed" until a credentialed reviewer approves them in Admin (SEO-04).
 *    A later file change clears any review (the reviewed text changed).
 *  - One content_revisions row per distinct body/title.
 *
 *   npm run content:publish            (writes)
 *   npm run content:publish -- --check (validates files only, no database)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import yaml from "js-yaml";
import { Pool } from "pg";
import { z } from "zod";
import * as schema from "../src/db/schema";
import { renderMarkdown } from "../src/lib/content/markdown";
import { textArray } from "../src/lib/sql";

const DIR = join(process.cwd(), "content", "posts");

const Front = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lower-case words joined by hyphens").max(90),
  title: z.string().min(10).max(110),
  dek: z.string().min(50).max(170),
  audience: z.enum(["patients", "physiotherapists"]),
  publishOn: z.union([z.string(), z.date()]).transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  specialty: z.string().optional(),
  tags: z.array(z.string().min(2).max(40)).max(8).default([]),
  faqs: z.array(z.object({ question: z.string().min(8).max(200), answer: z.string().min(20).max(800) })).max(8).default([]),
  sources: z.array(z.object({ title: z.string().min(3), url: z.url(), publisher: z.string().optional() })).max(10).default([]),
  author: z.string().default("The Physio Index editorial team"),
});

type Post = z.infer<typeof Front> & { body: string; file: string };

function load(): Post[] {
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort();
  } catch {
    return [];
  }
  const seen = new Set<string>();
  return files.map((file) => {
    const raw = readFileSync(join(DIR, file), "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) throw new Error(`${file}: missing YAML front matter`);
    const parsed = Front.safeParse(yaml.load(m[1]));
    if (!parsed.success) throw new Error(`${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    const body = m[2].trim();
    const words = body.split(/\s+/).length;
    if (words < 600) throw new Error(`${file}: body has ${words} words; posts need at least 600`);
    if (seen.has(parsed.data.slug)) throw new Error(`${file}: duplicate slug ${parsed.data.slug}`);
    seen.add(parsed.data.slug);
    return { ...parsed.data, body, file };
  });
}

function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

async function main() {
  const posts = load();
  console.log(`[publish-posts] ${posts.length} post file(s) valid`);
  if (process.argv.includes("--check") || posts.length === 0) return;

  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No database URL");
  const pool = new Pool({ connectionString: url, max: 2, application_name: "thephysioindex-publish-posts" });
  const db = drizzle(pool, { schema });
  const specs = await db.execute<{ id: string; code: string }>(sql`SELECT id, code FROM specialties`);
  const specialtyByCode = new Map(specs.rows.map((r) => [r.code, r.id]));
  const today = todayIst();
  let live = 0;
  let scheduled = 0;

  for (const p of posts) {
    const due = p.publishOn <= today;
    const status = due ? "published" : "draft";
    const tags = [...new Set([p.audience === "physiotherapists" ? "for-physiotherapists" : "for-patients", ...p.tags])];
    const specialtyId = p.specialty ? (specialtyByCode.get(p.specialty) ?? null) : null;
    const minutes = renderMarkdown(p.body).readingMinutes;
    const publishedAt = sql`(${p.publishOn}::date + time '09:00') AT TIME ZONE 'Asia/Kolkata'`;
    const res = await db.execute<{ id: string; status: string }>(sql`
      INSERT INTO content_articles (kind, slug, title, dek, body_markdown, status, author_name, primary_specialty_id, tags, faqs, sources, reading_minutes, noindex, published_at)
      VALUES ('blog', ${p.slug}, ${p.title}, ${p.dek}, ${p.body}, ${status}::content_status, ${p.author}, ${specialtyId}, ${textArray(tags)},
        ${JSON.stringify(p.faqs)}::jsonb, ${JSON.stringify(p.sources)}::jsonb, ${minutes}, false, ${due ? publishedAt : null})
      ON CONFLICT (kind, slug) DO UPDATE SET
        title = excluded.title, dek = excluded.dek, body_markdown = excluded.body_markdown, author_name = excluded.author_name,
        primary_specialty_id = excluded.primary_specialty_id, tags = excluded.tags, faqs = excluded.faqs, sources = excluded.sources,
        reading_minutes = excluded.reading_minutes,
        status = CASE WHEN content_articles.status IN ('withdrawn','rejected') THEN content_articles.status
                      WHEN content_articles.status = 'published' THEN 'published'::content_status
                      ELSE excluded.status END,
        published_at = coalesce(content_articles.published_at, excluded.published_at),
        reviewer_name = CASE WHEN content_articles.body_markdown IS DISTINCT FROM excluded.body_markdown THEN NULL ELSE content_articles.reviewer_name END,
        reviewer_credential = CASE WHEN content_articles.body_markdown IS DISTINCT FROM excluded.body_markdown THEN NULL ELSE content_articles.reviewer_credential END,
        reviewed_at = CASE WHEN content_articles.body_markdown IS DISTINCT FROM excluded.body_markdown THEN NULL ELSE content_articles.reviewed_at END,
        updated_at = CASE WHEN content_articles.body_markdown IS DISTINCT FROM excluded.body_markdown OR content_articles.title IS DISTINCT FROM excluded.title THEN now() ELSE content_articles.updated_at END
      RETURNING id, status::text AS status`);
    const row = res.rows[0];
    if (row.status === "published") live++;
    else if (row.status === "draft") scheduled++;
    await db.execute(sql`
      INSERT INTO content_revisions (article_id, revision_no, snapshot, actor_user_id, note)
      SELECT a.id, coalesce((SELECT max(revision_no) FROM content_revisions r WHERE r.article_id = a.id), 0) + 1, to_jsonb(a), NULL, ${`repo: content/posts/${p.file}`}
      FROM content_articles a
      WHERE a.id = ${row.id}
        AND NOT EXISTS (
          SELECT 1 FROM content_revisions r WHERE r.article_id = a.id
            AND r.revision_no = (SELECT max(revision_no) FROM content_revisions r2 WHERE r2.article_id = a.id)
            AND r.snapshot ->> 'body_markdown' = a.body_markdown AND r.snapshot ->> 'title' = a.title)`);
  }
  console.log(`[publish-posts] live ${live}, scheduled ${scheduled} (today ${today} IST)`);
  await pool.end();
}

main().catch((err) => {
  console.error("[publish-posts] failed", err);
  process.exit(1);
});
