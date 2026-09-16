import Link from "next/link";
import { baht } from "@/lib/utils";
import { categoryLabel } from "@/lib/constants";
import ProductVisual from "@/components/product-visual";
import type { Product } from "@/lib/types";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <ProductVisual
        product={product}
        className="h-20 w-20"
        emojiClassName="text-4xl"
      />
      <span className="font-medium leading-snug text-slate-900 group-hover:text-emerald-700">
        {product.name_en}
      </span>
      {product.name_th && (
        <span className="text-xs text-slate-400">{product.name_th}</span>
      )}
      <span className="mt-auto flex w-full items-center justify-between pt-2 text-sm">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
          {categoryLabel(product.category)}
        </span>
        <span className="font-semibold text-slate-700">{baht(Number(product.price_thb))}</span>
      </span>
    </Link>
  );
}
