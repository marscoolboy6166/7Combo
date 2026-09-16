import { ImageResponse } from "next/og";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "7Combo — discover 7-Eleven Thailand product combos";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          backgroundImage: "linear-gradient(135deg, #ecfdf5 0%, #ffffff 55%, #fffbeb 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: "#059669",
              color: "white",
              fontSize: 40,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            7
          </div>
          <div style={{ fontSize: 44, fontWeight: 800, color: "#064e3b", marginLeft: 20 }}>
            {APP_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>
            {APP_TAGLINE}
          </div>
          <div style={{ fontSize: 32, color: "#475569", marginTop: 24, display: "flex" }}>
            Real products · Real city availability · Community-rated hacks
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 28, color: "#64748b", display: "flex" }}>
            🏪 Made in Chiang Mai 🇹🇭
          </div>
          <div
            style={{
              display: "flex",
              padding: "14px 28px",
              background: "#059669",
              color: "white",
              borderRadius: 16,
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            Browse combos →
          </div>
        </div>
      </div>
    ),
    size,
  );
}
