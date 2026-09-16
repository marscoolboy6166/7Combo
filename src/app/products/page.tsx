import Link from "next/link";
import ProductCard from "@/components/product-card";
import EmptyState from "@/components/empty-state";
import CitySelect from "@/components/city-select";
import ProductSortSelect from "@/components/product-sort-select";
import {
  filterProducts,
  getProducts,
  getCombos,
  isDemoData,
  productInCity,
} from "@/lib/data";
import { getSelectedCity } from "@/lib/get-city";
import { CATEGORIES, cityLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Products" };

function SectionHeading({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="text-lg font-bold tracking-tight">
        <span className="mr-1.5">{emoji}</span>
        {title}
      </h2>
      {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
    </div>
  );
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string; all?: string }>;
}) {
  const { q, category, sort, all } = await searchParams;
  const city = await getSelectedCity();

  const allProducts = await getProducts();
  const demo = isDemoData(allProducts);
  const inCity = allProducts.filter((p) => productInCity(p, city));

  // Landing mode unless the visitor is searching, filtering, or asked for everything
  const browseMode = Boolean(q || category || all);

  // Trending: most-used products across combos (in-city only).
  // Match by slug so both real and demo combo data map onto the catalog.
  const combos = await getCombos();
  const usage = new Map<string, number>();
  for (const combo of combos) {
    for (const item of combo.items ?? []) {
      const slug = item.product?.slug;
      if (slug) usage.set(slug, (usage.get(slug) ?? 0) + 1);
    }
  }
  const trending = inCity
    .filter((p) => (usage.get(p.slug) ?? 0) > 0)
    .sort((a, b) => (usage.get(b.slug) ?? 0) - (usage.get(a.slug) ?? 0))
    .slice(0, 5);

  // New arrivals: 5 most recently added
  const fresh = [...inCity]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const categoryCounts = CATEGORIES.map((cat) => ({
    ...cat,
    count: inCity.filter((p) => p.category === cat.value).length,
  }));

  const products = browseMode ? filterProducts(allProducts, { q, category, city, sort }) : [];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-slate-500">
            {inCity.length} products stocked in {cityLabel(city)}
          </p>
        </div>
        <CitySelect value={city} />
      </div>

      <form action="/products" className="mt-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search products — try “milk”, “crab”, “mama”…"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Search
        </button>
      </form>

      {demo && (
        <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-800">
          Showing built-in demo products. Connect Supabase (see <code>README.md</code>) for the
          full catalog.
        </p>
      )}

      {!browseMode ? (
        <>
          {trending.length > 0 && (
            <section className="mt-8">
              <SectionHeading
                emoji="🔥"
                title="Trending in combos"
                subtitle="most-used by the community"
              />
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {trending.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-8">
            <SectionHeading emoji="✨" title="New arrivals" subtitle="latest additions" />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {fresh.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>

          <section className="mt-10">
            <SectionHeading emoji="🧭" title="Browse the aisles" subtitle="pick a category" />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {categoryCounts.map((cat) => (
                <Link
                  key={cat.value}
                  href={{ pathname: "/products", query: { category: cat.value } }}
                  className="group flex flex-col items-center gap-1 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                >
                  <span className="text-4xl transition group-hover:scale-110">{cat.emoji}</span>
                  <span className="font-semibold text-slate-800 group-hover:text-emerald-700">
                    {cat.label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {cat.count} {cat.count === 1 ? "product" : "products"}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <div className="mt-8 text-center">
            <Link
              href={{ pathname: "/products", query: { all: "1" } }}
              className="inline-block rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Browse all {inCity.length} products →
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <ProductSortSelect value={sort ?? "name"} />
              <Link
                href="/products"
                className="text-sm font-medium text-emerald-700 hover:underline"
              >
                ← Back to overview
              </Link>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={{ pathname: "/products", query: { ...(q ? { q } : {}), ...(sort ? { sort } : {}), all: "1" } }}
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
                  pathname: "/products",
                  query: {
                    ...(q ? { q } : {}),
                    ...(sort ? { sort } : {}),
                    ...(all ? { all: "1" } : {}),
                    category: cat.value,
                  },
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

          <section className="mt-6">
            {products.length === 0 ? (
              <EmptyState
                emoji="🔍"
                title="No products found"
                description={
                  q
                    ? `Nothing matches “${q}” in this city. Try another search or switch city.`
                    : "No products in this category for this city yet — check back soon."
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
