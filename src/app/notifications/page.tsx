"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "@/lib/types";

const SELECT = `
  id, type, actor_id, combo_id, is_read, created_at,
  actor:profiles!notifications_actor_id_fkey ( display_name, username, avatar_url ),
  combo:combos!notifications_combo_id_fkey ( slug, title )
` as const;

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationsPage() {
  const [state, setState] = useState<"loading" | "signed-out" | "ready">("loading");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ran = useRef(false);
  const router = useRouter();

  async function load() {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notifications")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      const missing =
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        /does not exist|could not find the table/i.test(error.message ?? "");
      setError(
        missing
          ? "Notifications aren't live yet — the roadmap #9 SQL block hasn't been run."
          : error.message,
      );
      return;
    }
    setError(null);
    setItems((data ?? []) as unknown as NotificationItem[]);
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setState("signed-out");
        return;
      }
      await load();
      setState("ready");
    });
  }, []);

  /** Mark one read and nudge the header bell via the focus listener. */
  async function markRead(item: NotificationItem) {
    if (item.is_read || busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.from("notifications").update({ is_read: true }).eq("id", item.id);
      setItems((list) =>
        list.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
      );
      window.dispatchEvent(new Event("focus"));
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userData.user.id)
        .eq("is_read", false);
      setItems((list) => list.map((n) => ({ ...n, is_read: true })));
      window.dispatchEvent(new Event("focus"));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-sm text-amber-800">
          <p className="text-3xl">🛠️</p>
          <h1 className="mt-2 text-lg font-bold">Supabase is not connected yet</h1>
        </div>
      </main>
    );
  }

  if (state === "loading") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center text-sm text-slate-500">
        Loading notifications…
      </main>
    );
  }

  if (state === "signed-out") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <span className="text-5xl">🔔</span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Sign in for notifications</h1>
          <p className="mt-2 text-sm text-slate-500">
            See when someone rates or comments on one of your combos.
          </p>
          <Link
            href="/login?next=/notifications"
            className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up ✓"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={busy}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Mark all read
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error}
        </div>
      )}

      {items.length === 0 && !error ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-400">
          Nothing yet — notifications show up when someone rates or comments on your combos.
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {items.map((n) => {
            const actorName = n.actor?.display_name ?? "A snacker";
            const href = n.combo ? `/combos/${n.combo.slug}` : "/combos";
            return (
              <li key={n.id}>
                <Link
                  href={href}
                  onClick={() => markRead(n)}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border p-4 transition",
                    n.is_read
                      ? "border-slate-200 bg-white hover:border-slate-300"
                      : "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300",
                  )}
                >
                  <span className="text-xl" aria-hidden>
                    {n.type === "rating" ? "⭐" : "💬"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-slate-700">
                      <strong className="font-semibold text-slate-900">{actorName}</strong>{" "}
                      {n.type === "rating" ? "rated" : "commented on"}{" "}
                      {n.combo ? (
                        <strong className="font-semibold text-emerald-700">{n.combo.title}</strong>
                      ) : (
                        "your combo"
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {timeAgo(n.created_at)}
                      {!n.is_read && (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                          NEW
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
