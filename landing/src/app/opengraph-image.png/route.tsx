import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "64px 72px", background: "#f5f2ed", color: "#1a1814", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 30 }}><span style={{ background: "#c8f060", borderRadius: 10, padding: "10px 14px", fontWeight: 700 }}>CV</span><span>CV Tailor</span></div>
      <div style={{ display: "flex", marginTop: 54, fontSize: 74, fontWeight: 700, letterSpacing: "-3px", lineHeight: 1.08 }}>Your career, open source.</div>
      <div style={{ display: "flex", marginTop: 26, maxWidth: 920, fontSize: 31, color: "#69635b", lineHeight: 1.45 }}>AI resume builder. Job application tracker. One local workspace.</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 28, borderTop: "2px solid #d4cfc7", fontSize: 22 }}><span>Your agent. Your machine.</span><span>cvtailor.me</span></div>
    </div>,
    { width: 1200, height: 630 },
  );
}
