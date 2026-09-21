"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Admin overview: tiles for the built sections, placeholders for the
 * planned ones, plus a live Auto-mod card fed by /api/admin/moderation.
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
      "Members, roles (admin / moderator / test), bans and timeouts, and the one-appeal system.",
    ready: true,
  },
  {
    href: null,
    title: "Site cosmetics",
    description: "Colors, decorations, banners. Planned — not built yet.",
    ready: false,
  },
] as const;

interface ModEvent {
  id: number;
  user_id: string;
  display_name: string | null;
  username: string | null;
  event_type: "warning" | "timeout";
  action: "post" | "rate";
  scope: "posting" | "rating";
  reason: string;
  until: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function AdminOverviewPage() {
  const [events, setEvents] = useState<ModEvent[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/moderation")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { events?: ModEvent[] } | null) => {
        if (alive && d) setEvents(d.events ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const timeouts = (events ?? []).filter((e) => e.event_type === "timeout");
  const warnings = (events ?? []).filter((e) => e.event_type === "warning");

  return (
    <main>
      <h2 className="text-2xl font-bold tracking-tight">Manage 7Combo</h2>
      <p className="mt-1 text-sm text-slate-500">
        Pick a section. Products and combos are open to moderators; users and roles are admin-only.
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

      {/* ---------- Auto-mod ---------- */}
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-900">Auto-mod</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Anti-spam: 3 posts/hour with warnings, then automatic timeouts. Rating different
              combos is unlimited; rapid re-rating of one combo is limited.
            </p>
          </div>
          {events !== null && (
            <div className="flex gap-2 text-xs font-semibold">
              <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                {warnings.length} warning{warnings.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">
                {timeouts.length} timeout{timeouts.length === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>

        {events === null ? (
          <p className="mt-4 text-sm text-slate-400">
            Auto-mod events load here. If nothing appears, the anti-spam migration may not be run
            yet (see supabase/anti-spam.sql).
          </p>
        ) : events.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No automatic actions in the last 24 hours — everyone is behaving.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {events.slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span
                    className={
                      e.event_type === "timeout"
                        ? "mr-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700"
                        : "mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700"
                    }
                  >
                    {e.event_type === "timeout" ? "timeout" : "warning"}
                  </span>
                  <Link
                    href={`/admin/users/${e.user_id}`}
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    {e.display_name ?? "Unknown user"}
                  </Link>
                  {e.username && <span className="text-slate-400"> @{e.username}</span>}
                  <span className="text-slate-500"> · {e.scope}</span>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                    {e.reason.startsWith("[Automatic]")
                      ? e.reason.slice("[Automatic]".length).trim()
                      : e.reason}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{timeAgo(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
