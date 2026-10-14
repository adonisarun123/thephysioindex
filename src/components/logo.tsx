/** Wordmark with the range-of-motion arc motif. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg aria-hidden width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M4 22a10 10 0 0 1 20 0" stroke="var(--moss)" strokeWidth="3" strokeLinecap="round" />
        <path d="M9 22a5 5 0 0 1 10 0" stroke="var(--amber)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="14" cy="22" r="2" fill="var(--moss-ink)" />
      </svg>
      <span className="font-bold tracking-tight text-brand-ink">The Physio Index</span>
    </span>
  );
}
