import { ImageResponse } from "next/og";

export const alt = "Glotter — localization management with AI-assisted translation";
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
          padding: "72px",
          background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
          color: "#F8FAFC",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <svg width="64" height="64" viewBox="0 0 218 218" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M30 45C30 36.7157 36.7157 30 45 30H173C181.284 30 188 36.7157 188 45V135C188 143.284 181.284 150 173 150H90L60 180V150H45C36.7157 150 30 143.284 30 135V45Z"
              fill="#5B9BD5"
            />
            <rect x="55" y="60" width="108" height="14" rx="7" fill="white" />
            <rect x="55" y="90" width="108" height="14" rx="7" fill="white" />
            <rect x="55" y="120" width="72" height="14" rx="7" fill="white" />
          </svg>
          <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.02em" }}>Glotter</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <span style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.03em", maxWidth: "900px" }}>
            Localization management with AI-assisted translation
          </span>
          <span style={{ fontSize: 30, color: "#94A3B8", maxWidth: "880px" }}>
            Import your language files, edit every language side by side, and let AI draft the rest.
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
