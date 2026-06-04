import { ImageResponse } from "next/og";

export const alt = "Glotter — AI-assisted localization management";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The brand logo, inlined so Satori rasterizes it via a data URI (resvg has full
// SVG support; inlining avoids any runtime filesystem/path lookup of public/).
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Avatar">
  <defs>
    <clipPath id="round-shoulders">
      <rect x="96" y="320" width="320" height="160" rx="48" ry="48" />
    </clipPath>
  </defs>
  <g fill="none" fill-rule="evenodd">
    <circle cx="108" cy="216" r="36" fill="#F7CDBF"/>
    <circle cx="404" cy="216" r="36" fill="#F7CDBF"/>
    <circle cx="256" cy="216" r="122" fill="#FADBD0"/>
    <path d="M140 196a24 24 0 0 0 48 0v-20h-48v20z" fill="#1C1C1C"/>
    <path d="M324 196a24 24 0 0 0 48 0v-20h-48v20z" fill="#1C1C1C"/>
    <path d="M134 158c17-64 70-104 122-104s105 40 122 104H134z" fill="#D33A53"/>
    <path d="M182 158c13-46 47-76 74-76s61 30 74 76H182z" fill="#A2273E"/>
    <rect x="100" y="158" width="312" height="36" rx="6" fill="#F2C84B"/>
    <circle cx="256" cy="54" r="22" fill="#F2C84B"/>
    <path d="M182 218c18-18 48-18 66 0" stroke="#1C1C1C" stroke-width="16" stroke-linecap="round" fill="none"/>
    <path d="M264 218c18-18 48-18 66 0" stroke="#1C1C1C" stroke-width="16" stroke-linecap="round" fill="none"/>
    <path d="M208 256c32 32 64 32 96 0" stroke="#1C1C1C" stroke-width="16" stroke-linecap="round" fill="none"/>
    <circle cx="196" cy="252" r="16" fill="#F59BB2"/>
    <circle cx="316" cy="252" r="16" fill="#F59BB2"/>
    <rect x="228" y="300" width="56" height="52" rx="10" fill="#EFC6B8"/>
    <g clip-path="url(#round-shoulders)">
      <rect x="96" y="316" width="320" height="176" rx="56" fill="#D33A53"/>
      <path d="M256 316c-36 0-80 52-80 124v52h160v-52c0-72-44-124-80-124z" fill="#F2C84B"/>
      <path d="M256 316c-51 0-92 46-92 104v72h32v-60c0-64 27-116 60-116z" fill="#C7354C"/>
      <path d="M256 316c51 0 92 46 92 104v72h-32v-60c0-64-27-116-60-116z" fill="#C7354C"/>
    </g>
    <rect x="236" y="316" width="40" height="176" fill="#F2C84B"/>
    <path d="M144 388h48v32h-48zM320 388h48v32h-48z" fill="#F2C84B"/>
  </g>
</svg>`;
const LOGO_SRC = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

// Editorial "type specimen" card matching the landing page: warm paper, ink,
// and a vermillion accent, with one greeting shown across languages.
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
          padding: "80px",
          background: "#FBF8F1",
          color: "#221C18",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <img src={LOGO_SRC} width={64} height={64} alt="" />
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em" }}>Glotter</span>
          </div>
          <span
            style={{ fontSize: 22, letterSpacing: "0.22em", textTransform: "uppercase", color: "#9A8F80" }}
          >
            Localization management
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: 78,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxWidth: "1000px",
            }}
          >
            <span>Every language,&nbsp;</span>
            <span style={{ color: "#D6431E" }}>side by side.</span>
          </div>
          <span style={{ fontSize: 30, letterSpacing: "0.04em", color: "#6E665F" }}>
            Hello · Hola · Bonjour · Hallo · Ciao · Olá
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ width: "72px", height: "4px", background: "#D6431E" }} />
          <span style={{ fontSize: 27, color: "#6E665F", maxWidth: "900px" }}>
            Import your locale files, edit every language side by side, and let AI draft the rest.
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
