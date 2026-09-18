import Link from "next/link";

const TILES = [
  {
    href: "/admin/products",
    title: "Products",
    description: "Catalog: names, prices, categories, city availability, photos, CSV import/export.",
    ready: true,
  },
  {
    href: "/admin/combos",
    title: "Combos",
    description: "Moderation: archive (hide from public), edit any combo, or delete with confirmation.",
    ready: true,
  },
  {
    href: null,
    title: "Users & bans",
    description: "Member list, profiles, and ban controls. Planned — not built yet.",
    ready: false,
  },
  {
    href: null,
    title: "Site cosmetics",
    description: "Colors, decorations, banners. Planned — not built yet.",
    ready: false,
  },
] as const;

export default function AdminHubPage() {
  return (
    <main>
      <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
      <p className="mt-1 text-sm text-slate-500">
        Pick a section to work on. New sections appear here as the site grows.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TILES.map((tile) => {
          const inner = (
            <div
              className={
                tile.ready
                  ? "flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
                  : "flex h-full flex-col rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6"
              }
            >
              <div className="flex items-start justify-between">
                {!tile.ready && (
                  <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    soon
                  </span>
                )}
              </div>
              <h3 className="mt-3 text-lg font-bold text-slate-900">{tile.title}</h3>
              <p className="mt-1 flex-1 text-sm text-slate-500">{tile.description}</p>
              {tile.ready && (
                <span className="mt-4 text-sm font-semibold text-emerald-700">Open</span>
              )}
            </div>
          );

          return tile.ready ? (
            <Link key={tile.title} href={tile.href ?? "#"} className="block">
              {inner}
            </Link>
          ) : (
            <div key={tile.title}>{inner}</div>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-slate-400">
        Admin actions are verified server-side on every request and enforced again by database
        security rules (RLS) — no signed-in user can reach anything here without the{" "}
        <code>is_admin</code> flag.
      </p>
    </main>
  );
}
