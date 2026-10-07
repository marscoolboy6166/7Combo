import Link from "next/link";
import Image from "next/image";
import { searchProfiles } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export const metadata = { title: "Snackers" };

/**
 * Members-only (roadmap #9): the directory is community space, so
 * signed-out visitors get a friendly gate instead of the member list.
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  let signedIn = false;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      signedIn = Boolean(data.user);
    } catch {
      signedIn = false;
    }
  }

  if (!signedIn) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <span className="text-5xl">🧑‍🍳</span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Snackers</h1>
          <p className="mt-2 text-sm text-slate-500">
            The member directory is for the community — sign in to browse it.
          </p>
          <Link
            href="/login?next=/users"
            className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const users = await searchProfiles(query);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Snackers</h1>
          <p className="text-sm text-slate-500">
            {users.length} member{users.length === 1 ? "" : "s"}
            {query ? ` matching "${query}"` : ""} — newest first
          </p>
        </div>
        <form action="/users" className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search members…"
            className="w-48 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Search
          </button>
        </form>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {users.map((u) => (
          <Link
            key={u.id}
            href={u.username ? `/u/${u.username}` : `/u/${u.id}`}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
          >
            {u.avatar_url ? (
              <Image
                src={u.avatar_url}
                alt=""
                width={48}
                height={48}
                unoptimized
                className="h-12 w-12 shrink-0 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl">
                🧑‍🍳
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-semibold text-slate-900">{u.display_name}</p>
                {u.role === "admin" && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    ADMIN
                  </span>
                )}
                {u.role === "moderator" && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    MODERATOR
                  </span>
                )}
                {u.is_test && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                    TEST
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-slate-500">
                @{u.username ?? "snacker"} · {u.combos_posted} combo
                {u.combos_posted === 1 ? "" : "s"} · {u.ratings_given} rating
                {u.ratings_given === 1 ? "" : "s"} given
              </p>
            </div>
          </Link>
        ))}
        {users.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">
            {query ? `No members match "${query}".` : "No members yet — be the first to sign in!"}
          </div>
        )}
      </section>
    </main>
  );
}
