import Link from "next/link";
import CitySelect from "@/components/city-select";
import ComboCard from "@/components/combo-card";
import EmptyState from "@/components/empty-state";
import { getCombos, getProducts, isDemoData } from "@/lib/data";
import { getSelectedCity } from "@/lib/get-city";
import { CATEGORIES, cityLabel } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const city = await getSelectedCity();

  const [combos, products] = await Promise.all([
    getCombos({ sort: "top", city }),
    getProducts(),
  ]);

  const demo = isDemoData(products);
  const trending = combos.slice(0, 6);
  const availableCount = products.filter(
    (p) => city === "all" || p.cities.includes("all") || p.cities.includes(city),
  ).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* Hero */}
      <section className="rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-500 px-6 py-12 text-center text-white shadow-sm sm:px-12">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-100">
          🇹🇭 7-Eleven Thailand · community-powered
        </p>
        <h1 className="mx-auto mt-3 max-w-2xl text-3xl font-extrabold leading-tight sm:text-5xl">
          Level up your 7-Eleven run.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-emerald-50">
          Discover real product combos from Thailand&apos;s favorite convenience store —
          like the viral fish-roe mayo dip with crab sticks — or post your own and let
          the community rate it.
        </p>

        <form action="/combos" className="mx-auto mt-6 flex max-w-xl gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search combos or ingredients — try “mama” or “crab”"
            className="w-full rounded-xl border-0 bg-white/95 px-4 py-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white"
          />
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Search
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-emerald-100">Popular:</span>
          {["crab", "mama", "mango", "mala"].map((tag) => (
            <Link
              key={tag}
              href={`/combos?q=${tag}`}
              className="rounded-full bg-white/15 px-3 py-1 font-medium backdrop-blur transition hover:bg-white/25"
            >
              {tag}
            </Link>
          ))}
        </div>
      </section>

      {/* City + catalog stats */}
      <section className="mt-8 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Trending combos</h2>
          <p className="text-sm text-slate-500">
            Top-rated by the community · showing availability for{" "}
            <span className="font-medium text-slate-700">{cityLabel(city)}</span>
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-slate-500 sm:block">
            🛒 {availableCount} products stocked in {cityLabel(city)}
          </span>
          <CitySelect value={city} />
        </div>
      </section>

      {demo && (
        <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-800">
          Showing built-in demo data. Connect Supabase (see <code>README.md</code>) to
          load the full catalog and enable posting.
        </p>
      )}

      {/* Trending grid */}
      <section className="mt-4">
        {trending.length === 0 ? (
          <EmptyState
            emoji="🏅"
            title="No combos in this city yet"
            description="Be the first to post a combo for this city — instant fame."
            ctaHref="/submit"
            ctaLabel="Post the first combo"
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trending.map((combo) => (
              <ComboCard key={combo.id} combo={combo} />
            ))}
          </div>
        )}
        <div className="mt-4 text-center">
          <Link
            href="/combos"
            className="inline-block rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Browse all combos →
          </Link>
        </div>
      </section>

      {/* Categories */}
      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-tight">Explore the aisles</h2>
        <p className="text-sm text-slate-500">
          Start from a product category and find what pairs with it.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.value}
              href={`/combos?category=${cat.value}`}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
            >
              <span className="text-2xl" aria-hidden>{cat.emoji}</span>
              <span className="text-sm font-semibold text-slate-700">{cat.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
