import Image from "next/image";

/**
 * TPi mark (concept raster supplied by the owner; production SVG master pending
 * per Visual Design Specification §3.1). Proportions preserved; clear space is
 * provided by the surrounding layout.
 */
export function Logo({ size = "md", withName = true }: { size?: "sm" | "md" | "lg"; withName?: boolean }) {
  const width = size === "sm" ? 64 : size === "lg" ? 104 : 88;
  const height = Math.round(width * (590 / 1270));
  return (
    <span className="inline-flex items-center gap-3">
      <Image src="/brand/tpi-logo-400.png" alt="" width={width} height={height} priority className="h-auto" style={{ width }} />
      {withName ? <span className="hidden text-base font-semibold text-navy sm:inline">The Physio Index</span> : null}
      <span className="sr-only">The Physio Index</span>
    </span>
  );
}
