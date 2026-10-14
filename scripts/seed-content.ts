/**
 * Preview-only editorial seed (SEO-02, SEO-04): 3 guides, 6 condition pages and
 * 3 clearly fictional news items, all published, so the public content routes
 * and the admin editor can be exercised on the dev branch. Idempotent: upserts
 * by (kind, slug) and writes one revision per run only when the row changed.
 * Runs only when SEED_DEV_DATA=1 and never against the production endpoint
 * (same guard as scripts/seed-dev.ts).
 *
 *   SEED_DEV_DATA=1 npm run db:seed:content
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { renderMarkdown } from "../src/lib/content/markdown";
import { FIXTURES } from "./seed-content-data";

if (process.env.SEED_DEV_DATA !== "1") {
  console.log("[seed-content] SEED_DEV_DATA is not 1; skipping");
  process.exit(0);
}

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No database URL");
  // Guard: never run against the production branch endpoint (mirrors seed-dev.ts).
  if (/ep-lingering-river-azw9th51/.test(url)) {
    throw new Error("[seed-content] refusing to seed preview content into the production branch");
  }
  const pool = new Pool({ connectionString: url, max: 2, application_name: "thephysioindex-seed-content" });
  const db = drizzle(pool, { schema });

  const specs = await db.execute<{ id: string; code: string }>(sql`SELECT id, code FROM specialties`);
  const specialtyByCode = new Map(specs.rows.map((r) => [r.code, r.id]));

  let upserted = 0;
  for (const f of FIXTURES) {
    const rendered = renderMarkdown(f.body);
    const specialtyId = f.specialty ? specialtyByCode.get(f.specialty) ?? null : null;
    if (f.specialty && !specialtyId) console.warn(`[seed-content] unknown specialty code ${f.specialty} for ${f.slug}`);
    const reviewed = Boolean(f.reviewer);
    // Published dates are staggered so list ordering and "newest first" are visible on previews.
    const daysAgo = FIXTURES.indexOf(f) + 1;
    const res = await db.execute<{ id: string }>(sql`
      INSERT INTO content_articles (kind, slug, title, dek, body_markdown, status, author_name, reviewer_name, reviewer_credential, reviewed_at,
        primary_specialty_id, tags, faqs, sources, condition, news_category, correction, corrected_at, reading_minutes, noindex, published_at)
      VALUES (${f.kind}, ${f.slug}, ${f.title}, ${f.dek}, ${f.body}, 'published', ${f.authorName ?? null},
        ${f.reviewer?.name ?? null}, ${f.reviewer?.credential ?? null}, ${reviewed ? sql`now() - make_interval(days => ${daysAgo}::int)` : null},
        ${specialtyId}, ${f.tags ?? []}::text[], ${JSON.stringify(f.faqs ?? [])}::jsonb, ${JSON.stringify(f.sources ?? [])}::jsonb,
        ${f.condition ? JSON.stringify(f.condition) : null}::jsonb, ${f.newsCategory ?? null},
        ${f.correction ?? null}, ${f.correction ? sql`now() - make_interval(days => ${Math.max(0, daysAgo - 1)}::int)` : null},
        ${rendered.readingMinutes}, false, now() - make_interval(days => ${daysAgo}::int))
      ON CONFLICT (kind, slug) DO UPDATE SET
        title = excluded.title, dek = excluded.dek, body_markdown = excluded.body_markdown, status = 'published',
        author_name = excluded.author_name, reviewer_name = excluded.reviewer_name, reviewer_credential = excluded.reviewer_credential,
        reviewed_at = CASE WHEN excluded.reviewer_name IS NULL THEN NULL ELSE coalesce(content_articles.reviewed_at, excluded.reviewed_at) END,
        primary_specialty_id = excluded.primary_specialty_id, tags = excluded.tags, faqs = excluded.faqs, sources = excluded.sources,
        condition = excluded.condition, news_category = excluded.news_category, correction = excluded.correction,
        corrected_at = CASE WHEN excluded.correction IS NULL THEN NULL ELSE coalesce(content_articles.corrected_at, excluded.corrected_at) END,
        reading_minutes = excluded.reading_minutes, withdrawn_at = NULL, decision_reason = NULL,
        published_at = coalesce(content_articles.published_at, excluded.published_at),
        updated_at = CASE WHEN content_articles.body_markdown IS DISTINCT FROM excluded.body_markdown OR content_articles.title IS DISTINCT FROM excluded.title THEN now() ELSE content_articles.updated_at END
      RETURNING id
    `);
    const id = res.rows[0].id;
    // One revision per distinct snapshot: skip when the latest snapshot already matches the body.
    await db.execute(sql`
      INSERT INTO content_revisions (article_id, revision_no, snapshot, actor_user_id, note)
      SELECT a.id, coalesce((SELECT max(revision_no) FROM content_revisions r WHERE r.article_id = a.id), 0) + 1,
             to_jsonb(a), NULL, 'seed-content'
      FROM content_articles a
      WHERE a.id = ${id}
        AND NOT EXISTS (
          SELECT 1 FROM content_revisions r WHERE r.article_id = a.id
            AND r.revision_no = (SELECT max(revision_no) FROM content_revisions r2 WHERE r2.article_id = a.id)
            AND r.snapshot ->> 'body_markdown' = a.body_markdown AND r.snapshot ->> 'title' = a.title
        )
    `);
    upserted++;
  }
  const counts = await db.execute<{ kind: string; n: number | string }>(sql`SELECT kind, count(*) AS n FROM content_articles WHERE status = 'published' GROUP BY kind ORDER BY kind`);
  console.log(`[seed-content] upserted ${upserted} fixtures; published: ${counts.rows.map((r) => `${r.kind}=${r.n}`).join(", ")}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed-content] failed", err);
  process.exit(1);
});
