/** Money helpers. Storage is integer paise (OFR-02); never floats. */

export function formatPaise(paise: number, opts: { showPaise?: boolean } = {}): string {
  const rupees = Math.trunc(paise / 100);
  const rem = Math.abs(paise % 100);
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(rupees);
  if (opts.showPaise && rem !== 0) return `₹${formatted}.${String(rem).padStart(2, "0")}`;
  return `₹${formatted}`;
}

/** Percentage discount in basis points, rounded to nearest paise with halves up (OFR-03). */
export function percentageDiscountPaise(basePaise: number, basisPoints: number): number {
  const numerator = basePaise * basisPoints; // exact integer arithmetic
  return Math.floor((numerator + 5000) / 10000);
}
