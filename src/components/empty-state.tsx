import Link from "next/link";
import { cn } from "@/lib/utils";

export default function EmptyState({
  emoji = "🛒",
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  emoji?: string;
  title: string;
  description?: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center")}>
      <span className="text-4xl" aria-hidden>{emoji}</span>
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {description && <p className="max-w-md text-sm text-slate-500">{description}</p>}
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
