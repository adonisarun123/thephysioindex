import Link from "next/link";
import type { PractitionerCard as Card } from "@/lib/directory";
import { formatPaise } from "@/lib/money";
import { VerificationBadge } from "./verification-badge";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => !/^(dr\.?|mr\.?|ms\.?|mrs\.?)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** DIR-03 fields in a ledger row. No invented availability for unbookable profiles. */
export function PractitionerCardRow({ card }: { card: Card }) {
  return (
    <li className="grid gap-3 border-b border-line py-5 sm:grid-cols-[3.5rem_1fr_auto] sm:gap-5">
      <div aria-hidden className="hidden h-14 w-14 items-center justify-center rounded-md bg-brand-soft text-lg font-semibold text-brand-ink sm:flex">
        {initials(card.displayName)}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold leading-tight">
            <Link href={card.path} className="hover:underline">
              {card.displayName}
            </Link>
          </h3>
          <VerificationBadge category={card.verification} />
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {[card.designation, card.primaryQualification].filter(Boolean).join(", ")}
          {card.primarySpecialty ? ` — ${card.primarySpecialty}` : ""}
        </p>
        <p className="mt-2 text-sm">
          <Link href={card.bestBranch.clinicPath} className="font-medium hover:underline">{card.bestBranch.clinicName}</Link>
          <span className="text-muted">, {card.bestBranch.localityName}, {card.bestBranch.cityName}</span>
          {card.otherBranchCount > 0 ? (
            <span className="text-muted">
              {" "}
              and {card.otherBranchCount} other {card.otherBranchCount === 1 ? "location" : "locations"}
              {card.otherBranches.length ? ` (${card.otherBranches.map((b) => b.localityName).join(", ")})` : ""}
            </span>
          ) : null}
        </p>
        {card.reviewCount > 0 ? (
          <p className="mt-1 text-sm text-muted">
            {card.ratingAvgX100 != null ? `${(card.ratingAvgX100 / 100).toFixed(1)} from ` : ""}
            {card.reviewCount} appointment {card.reviewCount === 1 ? "review" : "reviews"}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">No appointment reviews yet</p>
        )}
      </div>
      <div className="flex items-end justify-between gap-3 sm:flex-col sm:items-end sm:justify-start">
        <div className="text-right">
          {card.startingFeePaise != null ? (
            <>
              <p className="text-lg font-semibold">{formatPaise(card.startingFeePaise)}</p>
              <p className="text-xs text-muted">starting fee, pay at clinic</p>
            </>
          ) : (
            <p className="text-sm text-muted">Fee on enquiry</p>
          )}
        </div>
        {card.bookable ? (
          <Link href={`${card.path}#book`} className="btn btn-primary py-2">
            See availability
          </Link>
        ) : card.claimed ? (
          <Link href={card.path} className="btn btn-quiet py-2">
            View profile
          </Link>
        ) : (
          <Link href={`${card.path}#claim`} className="btn btn-quiet py-2">
            Unclaimed profile
          </Link>
        )}
      </div>
    </li>
  );
}
