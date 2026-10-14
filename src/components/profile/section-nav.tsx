"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Compact section links for the practitioner profile (PUB-07): one horizontal, scrollable row that sticks
 * under the site header and shows the section being read. Plain anchor links without JavaScript.
 */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => e !== null);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const inBand = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inBand.add(e.target.id);
          else inBand.delete(e.target.id);
        }
        const first = items.find((i) => inBand.has(i.id));
        if (first) setActive(first.id);
      },
      // Reading band: just below the site header + this bar, top third of the viewport.
      { rootMargin: "-150px 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  // Keep the active tab visible inside the horizontally scrolling row.
  useEffect(() => {
    const list = listRef.current;
    const link = list?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!list || !link) return;
    const left = link.offsetLeft - list.clientWidth / 2 + link.clientWidth / 2;
    list.scrollTo({ left, behavior: "smooth" });
  }, [active]);

  return (
    <nav aria-label="Profile sections" className="sticky top-16 z-20 -mx-4 mt-6 border-b border-line bg-background/95 backdrop-blur md:top-20 md:mx-0">
      <ul ref={listRef} className="flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:px-0 [&::-webkit-scrollbar]:hidden">
        {items.map((i) => {
          const on = i.id === active;
          return (
            <li key={i.id} className="shrink-0">
              <a
                href={`#${i.id}`}
                data-id={i.id}
                aria-current={on ? "location" : undefined}
                onClick={() => setActive(i.id)}
                className={`relative block whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full ${
                  on ? "text-brand after:bg-brand" : "text-muted after:bg-transparent hover:text-foreground"
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
