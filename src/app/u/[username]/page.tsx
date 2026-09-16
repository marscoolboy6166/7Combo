import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import ComboCard from "@/components/combo-card";
import EmptyState from "@/components/empty-state";
import { getProfileByUsername, getCombosByAuthor } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getProfileByUsername(decodeURIComponent(username));
  return {
    title: profile
      ? `${profile.display_name} (@${profile.username ?? "snacker"})`
      : "Profile",
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: raw } = await params;
  const profile = await getProfileByUsername(decodeURIComponent(raw));
  if (!profile) notFound();

  const combos = await getCombosByAuthor(profile.id);
  const ratingsReceived = combos.reduce((sum, c) => sum + c.rating_count, 0);
  const weightedSum = combos.reduce(
    (sum, c) => sum + Number(c.avg_rating) * c.rating_count,
    0,
  );
  const avgRating = ratingsReceived > 0 ? weightedSum / ratingsReceived : null;
  const joined = new Date(profile.created_at).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <Link href="/combos" className="text-sm text-emerald-700 hover:underline">
        ← All combos
      </Link>

      <section className="mt-3 flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {profile.avatar_url ? (
          <Image
            src={profile.avatar_url}
            alt={profile.display_name}
            width={72}
            height={72}
            unoptimized
            className="h-18 w-18 shrink-0 rounded-full border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-18 w-18 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-3xl">
            🧑‍🍳
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-extrabold tracking-tight">
              {profile.display_name}
            </h1>
            {profile.is_admin && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                ADMIN
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            @{profile.username ?? "snacker"} · Joined {joined}
          </p>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-extrabold text-slate-900">{combos.length}</p>
          <p className="text-xs font-medium text-slate-500">Combos posted</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-extrabold text-slate-900">{ratingsReceived}</p>
          <p className="text-xs font-medium text-slate-500">Stars received</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-extrabold text-slate-900">
            {avgRating !== null ? avgRating.toFixed(1) : "—"}
          </p>
          <p className="text-xs font-medium text-slate-500">Average rating</p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold tracking-tight">
          Combos by {profile.display_name}
        </h2>
        {combos.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {combos.map((combo) => (
              <ComboCard key={combo.id} combo={combo} />
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              emoji="🍳"
              title="No combos yet"
              description={`${profile.display_name} hasn't posted any combos — yet.`}
              ctaHref="/submit"
              ctaLabel="Post the first one"
            />
          </div>
        )}
      </section>
    </main>
  );
}
