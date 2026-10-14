import { connection } from "next/server";
import { ApiError, handler } from "@/lib/api";
import { apiViewer } from "@/lib/auth/session";
import { pathParam } from "@/lib/booking/http";
import { getPatientBooking } from "@/lib/booking/queries";

function ics(d: string) {
  return new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** GET /api/v1/bookings/{id}/calendar.ics — "add to calendar" (BKG-13). No appointment reason is included. */
export const GET = handler(async (req) => {
  await connection();
  const viewer = await apiViewer();
  const b = await getPatientBooking(viewer.userId, pathParam(req, 1));
  if (!b || b.status !== "confirmed") throw new ApiError("NOT_FOUND", "Appointment not found");
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Physio Index//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${b.id}@thephysioindex.com`,
    `DTSTAMP:${ics(new Date().toISOString())}`,
    `DTSTART:${ics(b.startsAt)}`,
    `DTEND:${ics(b.endsAt)}`,
    `SUMMARY:${esc(`Physiotherapy with ${b.practitionerName} (${b.reference})`)}`,
    `LOCATION:${esc(`${b.clinicName}, ${b.address}`)}`,
    `DESCRIPTION:${esc(`${b.offeringName}. Booking reference ${b.reference}. Pay at clinic.`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return new Response(body, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${b.reference}.ics"`, "Cache-Control": "no-store" } });
});
