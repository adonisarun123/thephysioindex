import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/admin-shell";
import { SeoOverrideForm } from "@/components/admin/seo-override-form";
import { hasRole, requireStaff } from "@/lib/auth/session";
import { deleteOverrideAction } from "@/lib/seo/actions";
import { listOverrides } from "@/lib/seo/gate";
import { computeRouteGroups } from "@/lib/seo/routes";

const SHOW_MAX = 60;

/** Indexable routes computed from data plus per-path overrides (SEO-01, SEO-02). */
export default function Page() {
  return (
    <Suspense fallback={<p className="text-muted">Computing indexable routes…</p>}>
      <Seo />
    </Suspense>
  );
}

async function Seo() {
  await connection();
  const viewer = await requireStaff(undefined, "/admin/seo");
  const canOverride = hasRole(viewer, "super_admin");
  const [groups, overrides] = await Promise.all([computeRouteGroups(), listOverrides()]);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.thephysioindex.com";

  return (
    <>
      <PageHeader title="SEO and indexation" description="What the sitemaps emit and which pages default to index, computed live from the database. Overrides pin a decision per path with a reason." />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-4">
          <p className="text-sm text-muted">
            Sitemap index: <a href={`${base}/sitemap.xml`} className="underline" target="_blank" rel="noopener">{base}/sitemap.xml</a>. Hosts on *.vercel.app carry a platform noindex header; indexing starts once the custom domain is attached.
          </p>
          {groups.map((g) => (
            <details key={g.key} className="card p-4" open={g.key === "hubs"}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{g.label}</span>
                <span className="flex items-center gap-2 text-sm">
                  <span className="pill bg-surface-2">{g.count}</span>
                  <span className={`pill ${g.indexableByDefault ? "bg-brand-soft text-brand-ink" : "bg-mark-soft"}`}>{g.indexableByDefault ? "index" : "partly noindex"}</span>
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted">{g.description}</p>
              {g.paths.length ? (
                <ul className="mt-3 grid gap-1 font-mono text-xs">
                  {g.paths.slice(0, SHOW_MAX).map((p) => <li key={p}>{p}</li>)}
                  {g.paths.length > SHOW_MAX ? <li className="font-sans text-muted">… and {g.paths.length - SHOW_MAX} more (see the sitemap)</li> : null}
                </ul>
              ) : null}
            </details>
          ))}

          <section className="card p-4">
            <h2 className="font-semibold">Current overrides</h2>
            {overrides.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No overrides. Every route follows its default.</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-1 font-normal">Path</th>
                    <th className="py-1 font-normal">Directive</th>
                    <th className="hidden py-1 font-normal md:table-cell">Reason</th>
                    <th className="py-1 font-normal">Expires</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((o) => {
                    const expired = o.expiresAt ? new Date(o.expiresAt) < new Date() : false;
                    return (
                      <tr key={o.id} className={`border-t border-line ${expired ? "text-muted" : ""}`}>
                        <td className="py-2 font-mono text-xs">{o.path}</td>
                        <td className="py-2"><span className={`pill ${o.directive === "force_index" ? "bg-brand-soft text-brand-ink" : "bg-alert-soft text-alert"}`}>{o.directive === "force_index" ? "index" : "noindex"}</span></td>
                        <td className="hidden py-2 md:table-cell">{o.reason}<span className="block text-xs text-muted">{o.setByEmail ?? "—"} · {new Date(o.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span></td>
                        <td className="py-2 text-xs">{o.expiresAt ? `${new Date(o.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}${expired ? " (expired)" : ""}` : "Never"}</td>
                        <td className="py-2 text-right">
                          {canOverride ? (
                            <form action={deleteOverrideAction}>
                              <input type="hidden" name="id" value={o.id} />
                              <button type="submit" className="text-xs underline">Delete</button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>
        <aside className="lg:sticky lg:top-4 lg:self-start">
          {canOverride ? <SeoOverrideForm /> : <p className="card p-4 text-sm text-muted">Only super administrators can set indexation overrides.</p>}
        </aside>
      </div>
    </>
  );
}
