import Link from "next/link";
import Stars from "@/components/stars";
import { baht } from "@/lib/utils";
import type { Combo } from "@/lib/types";

export default function ComboCard({ combo }: { combo: Combo }) {
  const items = combo.items ?? [];
  const emojis = items.map((i) => i.product?.emoji ?? "🛒").slice(0, 5);
  const total = items.reduce((sum, i) => sum + (i.product?.price_thb ?? 0) * (i.quantity || 1), 0);

  return (
    <Link
      href={`/combos/${combo.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex h-28 items-center justify-center gap-1 overflow-hidden bg-gradient-to-br from-emerald-50 to-amber-50 text-4xl">
        {emojis.length > 0 ? (
          emojis.map((e, i) => (
            <span key={i} style={{ transform: `rotate(${(i - (emojis.length - 1) / 2) * 6}deg)` }}>
              {e}
            </span>
          ))
        ) : (
          <span>🧪</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-semibold leading-snug text-slate-900 group-hover:text-emerald-700">
          {combo.title}
        </h3>
        <p className="line-clamp-2 text-sm text-slate-500">
          {combo.description ?? "A delicious experiment."}
        </p>
        <div className="mt-auto flex items-center justify-between pt-1">
          <Stars value={Number(combo.avg_rating)} count={combo.rating_count} />
          {total > 0 && (
            <span className="text-sm font-semibold text-slate-700">~{baht(total)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
