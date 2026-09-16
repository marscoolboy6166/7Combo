import Link from "next/link";
import ComboCard from "@/components/combo-card";
import EmptyState from "@/components/empty-state";
import { getCombos } from "@/lib/data";
import { getSelectedCity } from "@/lib/get-city";
import { CATEGORIES, cityLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Combos" };

export default async function CombosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string }>;
}) {
  const { q, category, sort } = await searchParams;
  const city = await getSelectedCity();
  const activeSort = sort === "top" ? "top" : "new";

  const combos = await getCombos({
    q,
    category,
    city,
    sort: activeSort,
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Combos</h1>
            <p className="text-sm text-slate-500">
              {combos.length} combo{combos.length === 1 ? "" : "s"}
              {q ? ` matching “${q}”` : ""} · availability for {cityLabel(city)}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Sort:</span>
            {(
              [
                ["top", "Top rated"],
                ["new", "Newest"],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                href={{
                  pathname: "/combos",
                  query: { ...(q ? { q } : {}), ...(category ? { category } : {}), sort: value },
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 font-medium transition",
                  activeSort === value
                    ? "bg-emerald-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <form action="/combos" className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search combos or ingredients…"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
          />
          {category && <input type="hidden" name="category" value={category} />}
          <input type="hidden" name="sort" value={activeSort} />
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          <Link
            href={{ pathname: "/combos", query: { ...(q ? { q } : {}), sort: activeSort } }}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition",
              !category
                ? "bg-slate-900 text-white"
                : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            All
          </Link>
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.value}
              href={{
                pathname: "/combos",
                query: { ...(q ? { q } : {}), category: cat.value, sort: activeSort },
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                category === cat.value
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {cat.emoji} {cat.label}
            </Link>
          ))}
        </div>
      </div>

      <section className="mt-6">
        {combos.length === 0 ? (
          <EmptyState
            emoji="🧪"
            title="No combos found"
            description={
              q
                ? `Nothing matches “${q}” yet. Try a shorter search — or invent the combo yourself.`
                : "No combos in this category for this city yet."
            }
            ctaHref="/submit"
            ctaLabel="Post the first combo"
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {combos.map((combo) => (
              <ComboCard key={combo.id} combo={combo} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
