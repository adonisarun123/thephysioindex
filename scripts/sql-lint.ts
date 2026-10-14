/**
 * SQL lint: extracts every sql`` template under src/ and scripts/, renders a
 * representative statement for each (scalars become NULL, nested fragments are
 * inlined, same-file fragment constants are resolved) and EXPLAINs it against
 * the database. EXPLAIN without ANALYZE plans only, so nothing is written.
 *
 * Catches ambiguous columns, missing columns, bad casts and syntax errors that
 * cannot be caught without a database. Fragments the renderer cannot place
 * (e.g. a dynamic table name) are reported as skipped, not failed.
 *
 *   npm run sql:lint            (needs MIGRATION_DATABASE_URL or DATABASE_URL)
 *   npm run sql:lint -- --print (render only, no database; for debugging)
 *   SQL_LINT_STRICT=1           fail the process on any failure
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Pool } from "pg";

type Part = { kind: "text"; value: string } | { kind: "expr"; value: string };
type Found = { file: string; line: number; text: string | null };

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

/** Skip a JS string literal starting at src[i] (quote char); returns index after it. */
function skipString(src: string, i: number): number {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === "\\") { j += 2; continue; }
    if (src[j] === q) return j + 1;
    j++;
  }
  return j;
}

/** Skip a template literal whose opening backtick is at src[i]; returns index after the closing backtick. */
function skipTemplate(src: string, i: number): number {
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\") { j += 2; continue; }
    if (ch === "`") return j + 1;
    if (ch === "$" && src[j + 1] === "{") { j = skipExpr(src, j + 2); continue; }
    j++;
  }
  return j;
}

/** Skip a `${ ... }` expression body starting after the `${`; returns index after the closing `}`. */
function skipExpr(src: string, i: number): number {
  let depth = 1;
  let j = i;
  while (j < src.length && depth > 0) {
    const ch = src[j];
    if (ch === "'" || ch === '"') { j = skipString(src, j); continue; }
    if (ch === "`") { j = skipTemplate(src, j); continue; }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    j++;
  }
  return j;
}

/** Parse the template literal whose opening backtick is at src[i] into text/expr parts. */
function parseTemplate(src: string, i: number): { parts: Part[]; end: number } {
  const parts: Part[] = [];
  let text = "";
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\") { text += src[j + 1] ?? ""; j += 2; continue; }
    if (ch === "`") { j++; break; }
    if (ch === "$" && src[j + 1] === "{") {
      if (text) parts.push({ kind: "text", value: text });
      text = "";
      const start = j + 2;
      const end = skipExpr(src, start);
      parts.push({ kind: "expr", value: src.slice(start, end - 1).trim() });
      j = end;
      continue;
    }
    text += ch;
    j++;
  }
  if (text) parts.push({ kind: "text", value: text });
  return { parts, end: j };
}

/** All top-level sql`...` templates in a source file (nested ones are reached through their expressions). */
function findTemplates(src: string): { start: number; parts: Part[] }[] {
  const out: { start: number; parts: Part[] }[] = [];
  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf("sql`", i);
    if (idx < 0) break;
    const before = src[idx - 1];
    if (before && /[\w.$]/.test(before)) { i = idx + 4; continue; }
    const { parts, end } = parseTemplate(src, idx + 3);
    out.push({ start: idx, parts });
    i = end;
  }
  return out;
}

const SCALAR_HELPERS = /^(textArray|uuidArray|enumArray|jsonb|JSON\.stringify|String|Number|Boolean|Math\.\w+|Date\.\w+|new Date)\b/;

/** Placeholder for an unknown fragment given the SQL text before it. null = cannot place; skip the statement. */
function contextual(before: string): string | null {
  const b = before.replace(/\s+$/, "");
  if (/\b(FROM|JOIN|UPDATE|INTO|TABLE)$/i.test(b)) return null;
  if (/\b(WHERE|AND|OR|ON|HAVING|WHEN|NOT)$/i.test(b)) return "TRUE";
  if (/\bORDER\s+BY$/i.test(b)) return "1";
  if (/\bSET$/i.test(b)) return "id = id";
  if (/\bIN$/i.test(b)) return "(NULL)";
  if (/(\bSELECT|,|\(|=|<|>|\bLIMIT|\bOFFSET|\bAS|\bBY|\bRETURNING)$/i.test(b)) return "NULL";
  return "";
}

type Ctx = { src: string; depth: number; seen: Set<string>; bindings: Record<string, string> };

/** Split a call's argument list at top-level commas. */
function splitArgs(argSrc: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < argSrc.length; i++) {
    const ch = argSrc[i];
    if (ch === "'" || ch === '"') { const e = skipString(argSrc, i); cur += argSrc.slice(i, e); i = e - 1; continue; }
    if (ch === "`") { const e = skipTemplate(argSrc, i); cur += argSrc.slice(i, e); i = e - 1; continue; }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Parameter names of an arrow-function or function declaration source. */
function paramNames(decl: string): string[] {
  const m = /^(?:async\s*)?(?:function\s+\w+\s*)?\(([^)]*)\)\s*(?::[^=]*)?=>?/.exec(decl.trim()) ?? /^(?:async\s*)?([A-Za-z_$][\w$]*)\s*=>/.exec(decl.trim());
  if (!m) return [];
  return splitArgs(m[1]).map((p) => p.replace(/[?:=][\s\S]*$/, "").trim()).filter(Boolean);
}

/** Render a parsed template to SQL text; null when a fragment cannot be placed. */
function render(parts: Part[], before: string, ctx: Ctx): string | null {
  let out = "";
  for (const p of parts) {
    if (p.kind === "text") { out += p.value; continue; }
    const sub = resolve(p.value, before + out, ctx);
    if (sub === null) return null;
    out += sub;
  }
  return out;
}

/** First non-empty rendering among the sql`` templates found inside an expression or declaration. */
function firstTemplate(exprSrc: string, before: string, ctx: Ctx): string | null | undefined {
  let i = 0;
  let fallback: string | null | undefined;
  while (i < exprSrc.length) {
    const idx = exprSrc.indexOf("sql`", i);
    if (idx < 0) break;
    const prev = exprSrc[idx - 1];
    if (prev && /[\w.$]/.test(prev)) { i = idx + 4; continue; }
    const { parts, end } = parseTemplate(exprSrc, idx + 3);
    const r = render(parts, before, ctx);
    if (r !== null && r.trim() !== "") return r;
    if (fallback === undefined) fallback = r;
    i = end;
  }
  return fallback;
}

/** Initializer source for a same-file const/let/function declaration, or undefined. */
function declaration(src: string, name: string): string | undefined {
  const re = new RegExp(`(?:const|let|var)\\s+${name}\\b[^=;\\n]*=\\s*`, "g");
  const m = re.exec(src);
  if (m) {
    const start = m.index + m[0].length;
    // initializer runs to the first `;` at nesting depth 0 (strings and templates skipped)
    let j = start;
    let depth = 0;
    while (j < src.length) {
      const ch = src[j];
      if (ch === "'" || ch === '"') { j = skipString(src, j); continue; }
      if (ch === "`") { j = skipTemplate(src, j); continue; }
      if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") { if (depth === 0) break; depth--; }
      else if (ch === ";" && depth === 0) break;
      else if (ch === "\n" && depth === 0 && /^\s*(const|let|var|export|function|if|for|return|await|\})/.test(src.slice(j + 1, j + 40))) break;
      j++;
    }
    return src.slice(start, j);
  }
  const fn = new RegExp(`function\\s+${name}\\s*\\(`).exec(src);
  if (fn) {
    const start = fn.index;
    const close = src.indexOf("\n}", start);
    return src.slice(start, close < 0 ? undefined : close);
  }
  return undefined;
}

function resolve(expr: string, before: string, ctx: Ctx): string | null {
  if (ctx.depth > 6) return contextual(before);
  if (/^sql\.raw\(/.test(expr)) {
    const lit = /^sql\.raw\(\s*(["'])(.*)\1\s*\)$/.exec(expr);
    if (lit) return lit[2];
    return contextual(before);
  }
  if (/^sql\.identifier\(/.test(expr)) return '"id"';
  if (/^sql\.(join|empty|fromList|param)\b/.test(expr)) {
    return /^sql\.param\b/.test(expr) ? "NULL" : contextual(before);
  }
  if (SCALAR_HELPERS.test(expr)) return "NULL";
  // Nested template(s): inline the first non-empty one (covers cond ? sql`A` : sql`B`).
  if (/(^|[^\w.$])sql`/.test(expr)) {
    const r = firstTemplate(expr, before, { ...ctx, depth: ctx.depth + 1 });
    if (r !== undefined) return r;
  }
  // Bare identifier or call of a same-file declaration.
  const id = /^([A-Za-z_$][\w$]*)(\s*\([\s\S]*\))?$/.exec(expr);
  if (id) {
    const name = id[1];
    if (name === "null" || name === "undefined" || name === "true" || name === "false") return "NULL";
    if (name in ctx.bindings) {
      const { [name]: _dropped, ...rest } = ctx.bindings;
      return resolve(ctx.bindings[name], before, { ...ctx, bindings: rest, depth: ctx.depth + 1 });
    }
    if (ctx.seen.has(name)) return contextual(before);
    const decl = declaration(ctx.src, name);
    if (decl !== undefined) {
      if (!/(^|[^\w.$])sql`/.test(decl) && !/\bsql\.(join|raw|identifier)\b/.test(decl)) return "NULL";
      const seen = new Set(ctx.seen); seen.add(name);
      // Bind call arguments to the declaration's parameters so `${c}` inside resolves to the argument.
      const bindings: Record<string, string> = {};
      if (id[2]) {
        const args = splitArgs(id[2].trim().slice(1, -1));
        paramNames(decl).forEach((p, i) => { if (args[i] !== undefined) bindings[p] = args[i]; });
      }
      const r = firstTemplate(decl, before, { src: ctx.src, depth: ctx.depth + 1, seen, bindings });
      if (r !== undefined) return r;
      return contextual(before);
    }
    // Undeclared (imported or parameter): decide by the SQL around it.
    return contextual(before);
  }
  // Member access, arithmetic, ternaries without sql, object literals: scalar parameters.
  return "NULL";
}

function lineOf(src: string, pos: number) {
  return src.slice(0, pos).split("\n").length;
}

function cleanup(text: string): string {
  let s = text.trim();
  s = s.replace(/NULL\s*::\s*NULL\[\]/g, "NULL");
  s = s.replace(/\bLIMIT\s+NULL\s*\+\s*1/g, "LIMIT 1");
  s = s.replace(/\bNULL\s*\[\]/g, "NULL");
  return s;
}

async function main() {
  const printOnly = process.argv.includes("--print");
  const root = process.cwd();
  const files = [...walk(join(root, "src")), ...walk(join(root, "scripts"))];
  const found: Found[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const t of findTemplates(src)) {
      const text = render(t.parts, "", { src, depth: 0, seen: new Set(), bindings: {} });
      found.push({ file: relative(root, f), line: lineOf(src, t.start), text: text === null ? null : cleanup(text) });
    }
  }
  const statements = found.filter((f) => {
    if (f.text === null) return false;
    const head = f.text.replace(/^\s*(--.*\n)*/g, "").trimStart().slice(0, 8).toUpperCase();
    return /^(SELECT|INSERT|UPDATE|DELETE|WITH)/.test(head);
  });
  const unplaceable = found.filter((f) => f.text === null).length;
  const fragments = found.length - statements.length - unplaceable;

  if (printOnly) {
    for (const s of statements) console.log(`-- ${s.file}:${s.line}\n${s.text}\n`);
    console.log(`[sql-lint] ${statements.length} statements, ${fragments} fragments, ${unplaceable} unplaceable`);
    return;
  }

  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("No database URL");
  const pool = new Pool({ connectionString: url, max: 1, application_name: "thephysioindex-sql-lint" });
  const client = await pool.connect();
  const failures: { where: string; error: string; sql: string }[] = [];
  try {
    for (const f of statements) {
      try {
        await client.query("BEGIN");
        await client.query(`EXPLAIN ${f.text}`);
        await client.query("ROLLBACK");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        const e = err as { message: string; code?: string };
        // Errors caused purely by NULL substitution are not code bugs.
        const benign = /could not determine data type of parameter|null value in column|violates not-null|cannot cast type unknown|could not determine polymorphic|argument of (WHERE|AND|OR|LIMIT|OFFSET) must|invalid input syntax|is of type .* but expression is of type (text|unknown)|function .*unknown.* does not exist|operator does not exist: .*unknown|column .* is of type .* but expression is of type|could not determine data type of/i.test(e.message);
        if (!benign) failures.push({ where: `${f.file}:${f.line}`, error: `${e.code ?? ""} ${e.message}`, sql: (f.text ?? "").replace(/\s+/g, " ").slice(0, 240) });
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
  console.log(`[sql-lint] ${statements.length} statements explained, ${fragments} fragments skipped, ${unplaceable} unplaceable, ${failures.length} failures`);
  for (const f of failures) console.log(`\n[sql-lint] ${f.where}\n  ${f.error}\n  ${f.sql}`);
  if (failures.length && process.env.SQL_LINT_STRICT === "1") process.exit(1);
}

main().catch((err) => {
  console.error("[sql-lint] failed", err);
  process.exit(1);
});
