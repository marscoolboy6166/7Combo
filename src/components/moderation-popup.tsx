"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ModEvent {
  id: number;
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_test: boolean | null;
  event_type: "warning" | "timeout" | "flood";
  action: "post" | "rate" | "comment";
  scope: "posting" | "rating";
  reason: string;
  until: string | null;
  expires_at: string;
  created_at: string;
  resolved_at: string | null;
  resolution: "confirmed" | "false_positive" | "unbanned" | null;
  acknowledged: boolean;
}

/** Trim the automatic-action prefixes so the popup shows the message. */
function stripPrefix(reason: string): string {
  if (reason.startsWith("[Automatic]")) return reason.slice("[Automatic]".length).trim();
  if (reason.startsWith("[Flood alert]")) return reason.slice("[Flood alert]".length).trim();
  return reason;
}

const REFRESH_MS = 120_000; // silent background refresh every 2 min

/** This admin has not seen it yet, and it is still unresolved. */
function isPending(e: ModEvent): boolean {
  return !e.resolved_at && !e.acknowledged;
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

/**
 * Mounted once in the admin layout. Shows every UNRESOLVED alert exactly once
 * per admin: closing the popup marks the shown alerts as seen for this admin
 * only (stored in the database, so it holds across browsers and devices).
 * Resolved alerts never appear here again.
 *
 * Two ways to resolve, both offered inline:
 *   “Correct”       — the automatic action was right; nothing else changes.
 *   “False automod” — the automatic action was wrong; any active automatic
 *                     restriction on that user is lifted.
 * Lifting a restriction by hand also resolves the user's alerts.
 */
export default function ModerationPopup() {
  const [events, setEvents] = useState<ModEvent[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shownIds = useRef<number[]>([]);
  const ran = useRef(false);

  const show = useCallback((list: ModEvent[]) => {
    const pending = list.filter(isPending);
    shownIds.current = pending.map((e) => e.id);
    if (pending.length > 0) setOpen(true);
  }, []);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const res = await fetch("/api/admin/moderation");
        if (!res.ok) return; // silent: the popup is a convenience, not a gate
        const data: { events?: ModEvent[] } = await res.json();
        const list = data.events ?? [];
        setEvents(list);
        show(list);
      } catch {
        /* network hiccup — retry on the next tick */
      }
    };

    void load();
    timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [show]);

  async function dismiss() {
    const ids = shownIds.current;
    setOpen(false);
    shownIds.current = [];
    if (ids.length > 0) {
      // Per-admin “seen” mark; a failure just means it may show again later.
      await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ack", ids }),
      }).catch(() => {});
    }
  }

  async function resolve(e: ModEvent, resolution: "confirmed" | "false_positive") {
    setBusyId(e.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", id: e.id, resolution }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Could not resolve this alert.");
        return;
      }
      const remaining = (events ?? []).filter((x) => x.id !== e.id);
      setEvents(remaining);
      const pending = remaining.filter(isPending);
      shownIds.current = pending.map((x) => x.id);
      if (pending.length === 0) setOpen(false);
    } finally {
      setBusyId(null);
    }
  }

  const pendingNow = (events ?? []).filter(isPending);
  if (!open || !events || pendingNow.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Unresolved automatic moderation actions"
    >
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Auto-mod review</h3>
            <p className="mt-1 text-xs text-slate-500">
              {pendingNow.length} unresolved alert{pendingNow.length === 1 ? "" : "s"} you
              haven&apos;t seen yet. Each alert is shown once per admin — closing this marks them
              as seen for you only. Resolve them here, or lift the restriction on the user&apos;s
              page.
            </p>
          </div>
          <button
            onClick={() => void dismiss()}
            aria-label="Dismiss"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            {error}
          </p>
        )}

        <ul className="mt-4 space-y-3">
          {pendingNow.map((e) => (
            <li
              key={e.id}
              className={cn(
                "rounded-xl border p-3",
                e.event_type === "timeout"
                  ? "border-red-200 bg-red-50"
                  : e.event_type === "flood"
                    ? "border-rose-200 bg-rose-50"
                    : "border-amber-200 bg-amber-50",
              )}
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-bold uppercase tracking-wide",
                    e.event_type === "timeout"
                      ? "bg-red-600 text-white"
                      : e.event_type === "flood"
                        ? "bg-rose-600 text-white"
                        : "bg-amber-500 text-white",
                  )}
                >
                  {e.event_type === "timeout"
                    ? "Auto-timeout"
                    : e.event_type === "flood"
                      ? "Flood alert"
                      : "Warning"}
                </span>
                <span className="font-semibold text-slate-700">
                  {e.scope === "posting" ? "posting" : "rating"}
                </span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{timeAgo(e.created_at)}</span>
                {e.is_test && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                    test account
                  </span>
                )}
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                  unresolved
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-700">
                <Link
                  href={`/admin/users/${e.user_id}`}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  {e.display_name ?? "Unknown user"}
                </Link>
                {e.username ? <span className="text-slate-400"> @{e.username}</span> : null}
              </p>
              <p className="mt-1 line-clamp-3 text-xs text-slate-600">{stripPrefix(e.reason)}</p>
              {e.event_type === "timeout" && e.until && (
                <p className="mt-1 text-xs font-medium text-red-700">
                  Until{" "}
                  {new Date(e.until).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === e.id}
                  onClick={() => void resolve(e, "confirmed")}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busyId === e.id ? "Saving…" : "Correct — resolve"}
                </button>
                <button
                  type="button"
                  disabled={busyId === e.id}
                  onClick={() => void resolve(e, "false_positive")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  False automod — lift
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            onClick={() => void dismiss()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
