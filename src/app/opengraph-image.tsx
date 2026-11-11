import { ImageResponse } from "next/og";

/**
 * Default share image for every public page that does not supply its own
 * (profiles with an approved photo do). Brand colours from the Visual Design
 * Specification; text only, no stock imagery and no claims (DIR-14).
 */
export const alt = "The Physio Index — find and book physiotherapists across India";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #12304A 0%, #006B5F 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: "#00A996", marginRight: 16 }} />
          The Physio Index
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2 }}>Find a physiotherapist near you.</div>
          <div style={{ marginTop: 28, fontSize: 32, lineHeight: 1.35, color: "rgba(255,255,255,0.86)" }}>
            Qualifications, registration checks and fees you can compare, across India.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.78)" }}>www.thephysioindex.com</div>
      </div>
    ),
    size,
  );
}
