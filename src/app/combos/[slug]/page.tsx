import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import RatingWidget from "@/components/rating-widget";
import IngredientChip from "@/components/ingredient-chip";
import Stars from "@/components/stars";
import { getComboBySlug, getCombos } from "@/lib/data";
import { baht } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const combo = await getComboBySlug(slug);
  if (!combo) return { title: "Combo not found" };

  const ingredients = (combo.items ?? [])
    .map((i) => i.product?.name_en)
    .filter(Boolean)
    .slice(0, 5)
    .join(" + ");
  const description =
    combo.description?.slice(0, 180) ??
    (ingredients ? `${ingredients} — rated by the 7Combo community` : "A 7-Eleven Thailand combo");

  return {
    title: combo.title,
    description,
    openGraph: {
      title: combo.title,
      description,
      type: "article" as const,
    },
  };
}

export default async function ComboDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const combo = await getComboBySlug(slug);
  if (!combo) notFound();

  const items = combo.items ?? [];
  const total = items.reduce(
    (sum, i) => sum + Number(i.product?.price_thb ?? 0) * (i.quantity || 1),
    0,
  );

  const related = (await getCombos({ sort: "top" }))
    .filter(
      (c) =>
        c.id !== combo.id &&
        c.items?.some((i) => items.some((mine) => mine.product_id === i.product_id)),
    )
    .slice(0, 3);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <Link href="/combos" className="text-sm text-emerald-700 hover:underline">
        ← All combos
      </Link>

      <header className="mt-3 flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">{combo.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
          <Stars value={combo.avg_rating} count={combo.rating_count} size="md" />
          <span>·</span>
          {combo.profiles?.username ? (
            <Link
              href={`/u/${combo.profiles.username}`}
              className="font-medium text-emerald-700 hover:underline"
            >
              by {combo.profiles.display_name ?? combo.author_name ?? "A snacker"}
            </Link>
          ) : (
            <span>by {combo.author_name ?? "A snacker"}</span>
          )}
          <span>·</span>
          {total > 0 && <span className="font-semibold text-slate-700">~{baht(total)} total</span>}
        </div>
      </header>

      {combo.photo_url && (
        <div className="relative mt-6 h-64 w-full overflow-hidden rounded-2xl border border-slate-200 sm:h-80">
          <Image
            src={combo.photo_url}
            alt={combo.title}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}

      {combo.description && (
        <p className="mt-6 text-lg leading-relaxed text-slate-700">{combo.description}</p>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold tracking-tight">Ingredients</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <IngredientChip key={item.product_id} item={item} />
          ))}
        </div>
      </section>

      {combo.steps && (
        <section className="mt-8">
          <h2 className="text-lg font-bold tracking-tight">How to make it</h2>
          <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {combo.steps.split("\n").map((line, i) => (
              <p key={i} className="text-sm leading-relaxed text-slate-700">
                {line.trim()}
              </p>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-lg font-bold tracking-tight">Rate this combo</h2>
        <div className="mt-3">
          <RatingWidget
            comboId={combo.id}
            comboSlug={combo.slug}
            initialAvg={combo.avg_rating}
            initialCount={combo.rating_count}
          />
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold tracking-tight">Pairs well with</h2>
          <div className="mt-3 flex flex-col gap-2">
            {related.map((c) => (
              <Link
                key={c.id}
                href={`/combos/${c.slug}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-emerald-300"
              >
                <span className="text-sm font-medium text-slate-800">{c.title}</span>
                <Stars value={c.avg_rating} count={c.rating_count} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
