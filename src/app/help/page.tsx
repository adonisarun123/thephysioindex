import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help and how verification works",
  alternates: { canonical: "/help" },
};

const LABELS = [
  ["Registration checked", "We checked a statutory registration with the issuing council and show the issuer, approved public number and date checked."],
  ["Document reviewed", "A reviewer examined a document the practitioner supplied. This does not mean a live registry confirmed it."],
  ["Enrolment only", "An allied-health enrolment identifier. Enrolment is not a licence and is labelled as such."],
  ["Membership", "Membership of a professional association. It is shown under memberships and is not a licence."],
  ["Pending / not independently verified", "A claim we have not been able to check yet."],
];

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Help</h1>
      <h2 className="mt-8 text-xl font-semibold">What our verification labels mean</h2>
      <p className="mt-2 text-muted">A label describes the check we performed. It is not a judgement of treatment quality and does not guarantee outcomes.</p>
      <dl className="mt-4 grid gap-3">
        {LABELS.map(([label, text]) => (
          <div key={label} className="card p-4">
            <dt className="font-medium">{label}</dt>
            <dd className="mt-1 text-sm text-muted">{text}</dd>
          </div>
        ))}
      </dl>
      <h2 className="mt-10 text-xl font-semibold">Bookings and cancellations</h2>
      <p className="mt-2 text-muted">Appointments are confirmed instantly and paid at the clinic. You can cancel or reschedule online up to 12 hours before; after that you can send a request to the clinic.</p>
      <h2 className="mt-10 text-xl font-semibold">Report a problem with a listing</h2>
      <p className="mt-2 text-muted">Every profile has “Report” and “Request a correction” links. Suspected credential fraud is handled in an urgent queue.</p>
    </div>
  );
}
