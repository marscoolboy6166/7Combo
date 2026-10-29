"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Filter alerts on the admin Filter-appeals page: every blocked post becomes
 * an alert, unresolved until staff confirm the filter or call it a false
 * positive (or decide the user's appeal). This is the full list; the popup
 * only nags once per staff member.
 */

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

const RESOLUTION_LABEL: Record<"confirmed" | "false_positive", string> = {
  confirmed: "resolved — filter was right",
  false_positive: "resolved — false positive",
};

function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function FilterAlertsCard() {
  const [events, setEvents] = useState<FilterEvent[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/filter-alerts");
      if (!res.ok) {
        setEvents([]);
        return;
      }
      const data: { events?: FilterEvent[] } = await res.json();
      setEvents(data.events ?? []);
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void load();
  }, [load]);

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
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const all = events ?? [];
  const unresolved = all.filter((e) => !e.resolved_at);
  const resolved = all.filter((e) => e.resolved_at);
  const visible = showResolved ? all : unresolved;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">Filter alerts</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Every post the content filter blocks is recorded here — one alert per user per hour,
            so repeated attempts don&apos;t pile up. Deciding an appeal resolves the user&apos;s
            open alerts automatically.
          </p>
        </div>
        {events !== null && (
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
              {unresolved.length} unresolved
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">
              {resolved.length} resolved
            </span>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}

      {events === null ? (
        <p className="mt-4 text-sm text-slate-400">Loading filter alerts…</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setShowResolved(false)}
              className={cn(
                "rounded-full px-3 py-1 font-semibold transition",
                !showResolved
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              Unresolved ({unresolved.length})
            </button>
            <button
              type="button"
              onClick={() => setShowResolved(true)}
              className={cn(
                "rounded-full px-3 py-1 font-semibold transition",
                showResolved
                  ? "bg-slate-900 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              All ({all.length})
            </button>
          </div>

          {visible.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              {showResolved
                ? "No blocked posts recorded yet."
                : "Nothing unresolved — every filter alert has been handled."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {visible.slice(0, 15).map((e) => (
                <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                      blocked {e.kind}
                    </span>
                    <Link
                      href={`/admin/users/${e.user_id}`}
                      className="font-semibold text-emerald-700 hover:underline"
                    >
                      {e.display_name ?? "Unknown user"}
                    </Link>
                    {e.username && <span className="text-slate-400"> @{e.username}</span>}
                    <span className="text-slate-500"> · {e.filter_reason}</span>
                    <p className="mt-0.5 line-clamp-1 text-xs italic text-slate-500">
                      “{e.flagged_text}”
                    </p>

                    {e.resolved_at ? (
                      <p className="mt-0.5 text-[11px] font-medium text-emerald-700">
                        {RESOLUTION_LABEL[e.resolution ?? "confirmed"]}
                      </p>
                    ) : (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === e.id}
                          onClick={() => void resolve(e, "confirmed")}
                          className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {busyId === e.id ? "Saving…" : "Filter was right"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === e.id}
                          onClick={() => void resolve(e, "false_positive")}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          False positive
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
