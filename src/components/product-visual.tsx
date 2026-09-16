import { cn } from "@/lib/utils";
import type { Product } from "@/lib/types";

/**
 * Shows a product's custom image when it has one, otherwise the emoji tile.
 * Used everywhere a product visual appears (cards, detail pages, submit form).
 */
export default function ProductVisual({
  product,
  className,
  emojiClassName,
  rounded = "rounded-2xl",
}: {
  product: Pick<Product, "emoji" | "image_url">;
  className?: string;
  emojiClassName?: string;
  rounded?: string;
}) {
  if (product.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.image_url}
        alt=""
        loading="lazy"
        className={cn("shrink-0 bg-slate-100 object-cover", rounded, className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-gradient-to-br from-emerald-50 to-amber-50",
        rounded,
        className,
        emojiClassName,
      )}
    >
      {product.emoji ?? "🛒"}
    </span>
  );
}
