"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface FilterEvent {
  id: number;
  user_id: string;
  display_name: string | null;
  username: string | null;
  kind: "combo" | "comment";
  filter_reason: string;
  flagged_text: string;
  created_at: string;
  resolved_at: string | null;
  resolution: "confirmed" | "false_positive" | null;
  acknowledged: boolean;
}

const REFRESH_MS = 120_000;

/** Not seen by this staff member yet, and still unresolved. */
function isPending(e: FilterEvent): boolean {
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
 * Mounted once in the admin layout (admins, owner and moderators). Shows each
 * filter alert exactly once per staff member: closing marks the shown alerts
 * as seen for you only. Resolved alerts never appear here again.
 *
 *   “Filter was right”  — resolve as confirmed (nothing else changes)
 *   “False positive”    — resolve as false_positive
 * Deciding the user's appeal resolves their open alerts automatically.
 */
export default function FilterAlertPopup() {
  const [events, setEvents] = useState<FilterEvent[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shownIds = useRef<number[]>([]);
  const ran = useRef(false);

  const show = useCallback((list: FilterEvent[]) => {
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
        const res = await fetch("/api/admin/filter-alerts");
        if (!res.ok) return; // silent: convenience, not a gate
        const data: { events?: FilterEvent[] } = await res.json();
        const list = data.events ?? [];
        setEvents(list);
        show(list);
      } catch {
        /* retry on the next tick */
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
      await fetch("/api/admin/filter-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ack", ids }),
      }).catch(() => {});
    }
  }

  async function resolve(e: FilterEvent, resolution: "confirmed" | "false_positive") {
    setBusyId(e.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/filter-alerts", {
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
      aria-label="Unresolved filter alerts"
    >
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Filter alerts</h3>
            <p className="mt-1 text-xs text-slate-500">
              {pendingNow.length} blocked post{pendingNow.length === 1 ? "" : "s"} you
              haven&apos;t reviewed yet. Each alert shows once per staff member — closing marks
              them as seen for you only.
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
            <li key={e.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-amber-500 px-2 py-0.5 font-bold uppercase tracking-wide text-white">
                  blocked {e.kind}
                </span>
                <span className="font-semibold text-slate-700">{e.filter_reason}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{timeAgo(e.created_at)}</span>
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

              <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-white/70 px-2 py-1 text-xs italic text-slate-600 line-clamp-3">
                “{e.flagged_text}”
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === e.id}
                  onClick={() => void resolve(e, "confirmed")}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busyId === e.id ? "Saving…" : "Filter was right"}
                </button>
                <button
                  type="button"
                  disabled={busyId === e.id}
                  onClick={() => void resolve(e, "false_positive")}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  False positive
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
