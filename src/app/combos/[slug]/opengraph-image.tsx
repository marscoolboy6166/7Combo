import { ImageResponse } from "next/og";
import { getComboBySlug } from "@/lib/data";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "7Combo — a 7-Eleven Thailand product combo";

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24">
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"
        fill={filled ? "#f59e0b" : "#dbe3ec"}
      />
    </svg>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const combo = await getComboBySlug(slug);

  if (!combo) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ecfdf5",
            fontSize: 72,
            fontWeight: 800,
            color: "#064e3b",
          }}
        >
          7Combo
        </div>
      ),
      size,
    );
  }

  const allItems = combo.items ?? [];
  const shown = allItems.slice(0, 4);
  const total = allItems.reduce(
    (sum, i) => sum + Number(i.product?.price_thb ?? 0) * (i.quantity || 1),
    0,
  );
  const stars = Math.round(combo.avg_rating);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          backgroundImage: "linear-gradient(135deg, #ecfdf5 0%, #ffffff 55%, #fffbeb 100%)",
        }}
      >
        {/* Top bar: brand */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: "#059669",
                color: "white",
                fontSize: 30,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              7
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color: "#064e3b", marginLeft: 16 }}>
              7Combo
            </div>
          </div>
          <div style={{ fontSize: 24, color: "#64748b" }}>7-Eleven Thailand hack</div>
        </div>

        {/* Middle: title + ingredient pills */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 800,
              color: "#0f172a",
              lineHeight: 1.15,
              marginBottom: 28,
            }}
          >
            {combo.title}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            {shown.map((i) => (
              <div
                key={i.product_id}
                style={{
                  display: "flex",
                  padding: "10px 20px",
                  marginRight: 12,
                  marginBottom: 12,
                  background: "white",
                  border: "2px solid #d1fae5",
                  borderRadius: 999,
                  fontSize: 25,
                  color: "#065f46",
                }}
              >
                {i.product?.name_en ?? "?"}
              </div>
            ))}
            {allItems.length > shown.length && (
              <div style={{ display: "flex", padding: "10px 20px", fontSize: 25, color: "#64748b" }}>
                +{allItems.length - shown.length} more
              </div>
            )}
          </div>
        </div>

        {/* Bottom: rating + total price */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} style={{ display: "flex", marginRight: 4 }}>
                <Star filled={n <= stars} />
              </div>
            ))}
            <div style={{ fontSize: 30, color: "#475569", marginLeft: 12 }}>
              {combo.avg_rating > 0
                ? `${combo.avg_rating.toFixed(1)} from ${combo.rating_count} ${
                    combo.rating_count === 1 ? "snacker" : "snackers"
                  }`
                : "New combo — be the first to rate"}
            </div>
          </div>
          {total > 0 && (
            <div
              style={{
                display: "flex",
                padding: "14px 28px",
                background: "#059669",
                color: "white",
                borderRadius: 16,
                fontSize: 32,
                fontWeight: 700,
              }}
            >
              ~THB {total}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
