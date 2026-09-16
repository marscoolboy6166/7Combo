import { cn } from "@/lib/utils";

export default function Stars({
  value,
  count,
  size = "sm",
}: {
  value: number;
  count?: number;
  size?: "sm" | "md" | "lg";
}) {
  const px = size === "lg" ? "text-lg" : size === "md" ? "text-base" : "text-sm";
  const rounded = Math.round(value * 2) / 2; // nearest half star

  return (
    <span className={cn("inline-flex items-center gap-1", px)}>
      <span className="tracking-tight" aria-label={`${value.toFixed(1)} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={i <= rounded ? "text-amber-400" : "text-slate-300"}>
            ★
          </span>
        ))}
      </span>
      <span className="text-slate-500">
        {value > 0 ? value.toFixed(1) : "–"}
        {typeof count === "number" && count > 0 ? ` (${count})` : ""}
      </span>
    </span>
  );
}
