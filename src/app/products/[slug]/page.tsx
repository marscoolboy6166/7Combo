import Link from "next/link";
import { notFound } from "next/navigation";
import ComboCard from "@/components/combo-card";
import ProductVisual from "@/components/product-visual";
import { getProductBySlug, getCombos, isDemoData } from "@/lib/data";
import { getSelectedCity } from "@/lib/get-city";
import { categoryLabel, cityLabel } from "@/lib/constants";
import { baht } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  return { title: product?.name_en ?? "Product" };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const city = await getSelectedCity();
  const availableHere =
    city === "all" || product.cities.includes("all") || product.cities.includes(city);

  const combos = (await getCombos({ productSlug: slug, sort: "top" }));
  const demo = isDemoData(combos);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <Link href="/products" className="text-sm text-emerald-700 hover:underline">
        ← All products
      </Link>

      <header className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
        <ProductVisual
          product={product}
          rounded="rounded-3xl"
          className="h-24 w-24 shadow-sm"
          emojiClassName="text-5xl"
        />
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{product.name_en}</h1>
          {product.name_th && <p className="mt-1 text-slate-500">{product.name_th}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">
              {categoryLabel(product.category)}
            </span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700">
              {baht(Number(product.price_thb))}
            </span>
            <span
              className={
                availableHere
                  ? "rounded-full bg-sky-50 px-2.5 py-0.5 text-sky-700"
                  : "rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-700"
              }
            >
              {availableHere ? `✓ Available in ${cityLabel(city)}` : `✗ Not stocked in ${cityLabel(city)}`}
            </span>
          </div>
        </div>
      </header>

      {product.description && (
        <p className="mt-6 text-lg leading-relaxed text-slate-700">{product.description}</p>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Where you can find it
        </h2>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          {product.cities.includes("all")
            ? ["bangkok", "chiangmai", "chiangrai", "pattaya", "phuket"].map((c) => (
                <span key={c} className="rounded-full border border-slate-200 bg-white px-3 py-1">
                  📍 {cityLabel(c)}
                </span>
              ))
            : product.cities.map((c) => (
                <span key={c} className="rounded-full border border-slate-200 bg-white px-3 py-1">
                  📍 {cityLabel(c)}
                </span>
              ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight">Combos using this</h2>
        {combos.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
            No combos yet —{" "}
            <Link href={`/submit?product=${product.slug}`} className="font-semibold text-emerald-700 hover:underline">
              invent one with this product
            </Link>
            .
          </p>
        ) : (
          <>
            {demo && (
              <p className="mt-3 text-sm text-sky-700">Demo data — connect Supabase for live combos.</p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {combos.map((combo) => (
                <ComboCard key={combo.id} combo={combo} />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
