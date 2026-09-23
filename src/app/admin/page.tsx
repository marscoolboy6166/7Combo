"use client";

import Link from "next/link";

/**
 * Admin overview: tiles for the built sections and the planned ones.
 * Live management cards live in their own sections now — Auto-mod is on
 * the Users page, filter appeals has a dedicated page in the nav.
 * Text-only — the admin area stays emoji-free by design.
 */
const TILES = [
  {
    href: "/admin/products",
    title: "Products",
    description:
      "Catalog: names, prices, categories, city availability, photos, CSV import/export.",
    ready: true,
  },
  {
    href: "/admin/combos",
    title: "Combos",
    description:
      "Moderation: archive (hide from public), edit any combo, or delete with confirmation.",
    ready: true,
  },
  {
    href: "/admin/users",
    title: "Users",
    description:
      "Members, roles (admin / moderator / test), bans and timeouts, one-appeal system, and the Auto-mod feed.",
    ready: true,
  },
  {
    href: "/admin/filter-appeals",
    title: "Filter appeals",
    description:
      "Review contested filter rejections and manage the phrase whitelist.",
    ready: true,
  },
  {
    href: null,
    title: "Site cosmetics",
    description: "Colors, decorations, banners. Planned — not built yet.",
    ready: false,
  },
] as const;

export default function AdminOverviewPage() {
  return (
    <main>
      <h2 className="text-2xl font-bold tracking-tight">Manage 7Combo</h2>
      <p className="mt-1 text-sm text-slate-500">
        Pick a section. Products, combos and filter appeals are open to moderators; users and
        roles are admin-only.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {TILES.map((t) =>
          t.ready && t.href ? (
            <Link
              key={t.title}
              href={t.href}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow"
            >
              <p className="font-bold text-slate-900 group-hover:text-emerald-700">{t.title}</p>
              <p className="mt-1 text-sm text-slate-500">{t.description}</p>
            </Link>
          ) : (
            <div
              key={t.title}
              className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5"
            >
              <p className="font-bold text-slate-400">{t.title}</p>
              <p className="mt-1 text-sm text-slate-400">{t.description}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                coming soon
              </p>
            </div>
          ),
        )}
      </div>
    </main>
  );
}
