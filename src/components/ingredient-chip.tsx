import Link from "next/link";
import { baht } from "@/lib/utils";
import type { ComboItem } from "@/lib/types";

export default function IngredientChip({ item }: { item: ComboItem }) {
  const product = item.product;
  return (
    <Link
      href={product ? `/products/${product.slug}` : "#"}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50"
    >
      <span aria-hidden>{product?.emoji ?? "🛒"}</span>
      <span className="font-medium text-slate-800">
        {product?.name_en ?? "Unknown product"}
      </span>
      {(item.quantity ?? 1) > 1 && <span className="text-slate-500">×{item.quantity}</span>}
      {product && <span className="text-slate-400">{baht(Number(product.price_thb))}</span>}
    </Link>
  );
}
