"use client";

import { useEffect, useState } from "react";

/**
 * "On this page" navigation for the practitioner profile rail (DIR-02).
 * Highlights the section currently in view. Without JavaScript it is a plain list of anchor links.
 */
export function ProfileToc({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (!sections.length || typeof IntersectionObserver === "undefined") return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        // The first section (in page order) that is inside the reading band wins.
        const first = items.find((i) => visible.has(i.id));
        if (first) setActive(first.id);
      },
      // Reading band: below the sticky site header, top 40% of the viewport.
      { rootMargin: "-96px 0px -60% 0px", threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page" className="card p-4 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">On this page</p>
      <ul className="mt-2 grid border-l border-line">
        {items.map((i) => {
          const isActive = i.id === active;
          return (
            <li key={i.id}>
              <a
                href={`#${i.id}`}
                aria-current={isActive ? "location" : undefined}
                onClick={() => setActive(i.id)}
                className={`-ml-px block border-l-2 py-1.5 pl-3 transition-colors ${
                  isActive
                    ? "border-brand font-medium text-brand-ink"
                    : "border-transparent text-muted hover:border-line hover:text-foreground"
                }`}
              >
                {i.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
