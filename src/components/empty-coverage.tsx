import Link from "next/link";

/** Honest empty state: never invent coverage (DIR-14). Offers a broader scope. */
export function EmptyCoverage({ scope, backHref, backLabel }: { scope: string; backHref: string; backLabel: string }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-6">
      <p className="font-medium">No published physiotherapist profiles in {scope} yet.</p>
      <p className="mt-1 text-sm text-muted">
        We only list profiles that have passed review. Try <Link href={backHref} className="underline">{backLabel}</Link>, or if you practise here,{" "}
        <Link href="/for-physiotherapists" className="underline">create your profile</Link>.
      </p>
    </div>
  );
}
