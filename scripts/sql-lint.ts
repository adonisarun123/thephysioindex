/**
 * SQL lint: extracts every sql`` template under src/ and scripts/, replaces
 * each ${...} interpolation with NULL, and EXPLAINs the result against the
 * database (no rows are written: EXPLAIN without ANALYZE plans only).
 * Catches ambiguous columns, missing columns, bad casts and syntax errors
 * that cannot be caught without a database. Dynamic fragments can produce
 * false positives, which are listed as "dynamic" when the substituted text
 * is clearly not a statement.
 *
 *   npm run sql:lint            (needs MIGRATION_DATABASE_URL or DATABASE_URL)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Pool } from "pg";

type Found = { file: string; line: number; text: string };

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/sql-lint\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** Scan a file for sql`...` templates, handling nested ${ sql`...` }. */
function extract(src: string): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf("sql`", i);
    if (idx < 0) break;
    // skip sql.raw`, sql.join etc: require word boundary before "sql"
    const before = src[idx - 1];
    if (before && /[\w.$]/.test(before)) {
      i = idx + 4;
      continue;
    }
    let j = idx + 4;
    let depth = 0; // ${ } nesting
    let text = "";
    const tplStack: number[] = []; // depth values at which a nested template literal opened
    while (j < src.length) {
      const ch = src[j];
      if (ch === "\\" ) {
        text += depth === 0 ? ch + src[j + 1] : "";
        j += 2;
        continue;
      }
      if (depth === 0) {
        if (ch === "`") break;
        if (ch === "$" && src[j + 1] === "{") {
          depth = 1;
          text += "NULL";
          j += 2;
          continue;
        }
        text += ch;
        j++;
        continue;
      }
      // inside an interpolation expression
      if (ch === "`") {
        // nested template literal open/close
        if (tplStack.length && tplStack[tplStack.length - 1] === depth) tplStack.pop();
        else tplStack.push(depth);
        j++;
        continue;
      }
      if (tplStack.length && tplStack[tplStack.length - 1] === depth) {
        // inside nested template text: track ${
        if (ch === "$" && src[j + 1] === "{") {
          depth++;
          j += 2;
          continue;
        }
        j++;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      j++;
    }
    out.push({ start: idx, text });
    i = j + 1;
  }
  return out;
}

function lineOf(src: string, pos: number) {
  return src.slice(0, pos).split("\n").length;
}

function cleanup(text: string): string {
  let s = text.trim();
  // common fragment shapes that NULL substitution breaks
  s = s.replace(/NULL\s*::\s*NULL\[\]/g, "NULL");
  s = s.replace(/\bLIMIT\s+NULL\s*\+\s*1/g, "LIMIT 1");
  s = s.replace(/\bNULL\s*\[\]/g, "NULL");
  return s;
}

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No database URL");
  const root = process.cwd();
  const files = [...walk(join(root, "src")), ...walk(join(root, "scripts"))];
  const found: Found[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const e of extract(src)) found.push({ file: relative(root, f), line: lineOf(src, e.start), text: cleanup(e.text) });
  }
  const pool = new Pool({ connectionString: url, max: 1, application_name: "thephysioindex-sql-lint" });
  const client = await pool.connect();
  let checked = 0;
  let dynamic = 0;
  const failures: { where: string; error: string; sql: string }[] = [];
  try {
    for (const f of found) {
      const head = f.text.replace(/^\s*(--.*\n)*/g, "").trimStart().slice(0, 8).toUpperCase();
      if (!/^(SELECT|INSERT|UPDATE|DELETE|WITH)/.test(head)) {
        dynamic++;
        continue;
      }
      checked++;
      try {
        await client.query("BEGIN");
        await client.query(`EXPLAIN ${f.text}`);
        await client.query("ROLLBACK");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        const e = err as { message: string; code?: string };
        // Errors caused purely by NULL substitution are not code bugs.
        const benign = /could not determine data type of parameter|null value in column|violates not-null|cannot cast type unknown|could not determine polymorphic|argument of (WHERE|AND|OR|LIMIT|OFFSET) must|invalid input syntax|is of type .* but expression is of type (text|unknown)|function .*unknown.* does not exist|operator does not exist: .*unknown|column .* is of type .* but expression is of type/i.test(e.message);
        if (!benign) failures.push({ where: `${f.file}:${f.line}`, error: `${e.code ?? ""} ${e.message}`, sql: f.text.replace(/\s+/g, " ").slice(0, 220) });
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
  console.log(`[sql-lint] ${checked} statements explained, ${dynamic} fragments skipped, ${failures.length} failures`);
  for (const f of failures) {
    console.log(`\n[sql-lint] ${f.where}\n  ${f.error}\n  ${f.sql}`);
  }
  if (failures.length && process.env.SQL_LINT_STRICT === "1") process.exit(1);
}

main().catch((err) => {
  console.error("[sql-lint] failed", err);
  process.exit(1);
});
