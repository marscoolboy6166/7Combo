"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Auto-mod card: recent anti-spam actions (warnings / automatic timeouts /
 * flood alerts) fed by /api/admin/moderation. Rendered inside the admin Users
 * page. Unresolved alerts can be resolved here; resolved ones stay visible as
 * history and never alert again.
 */

interface ModEvent {
  id: number;
  user_id: string;
  display_name: string | null;
  username: string | null;
  event_type: "warning" | "timeout" | "flood";
  action: "post" | "rate" | "comment";
  scope: "posting" | "rating";
  reason: string;
  until: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution: "confirmed" | "false_positive" | "unbanned" | null;
  acknowledged: boolean;
}

const RESOLUTION_LABEL: Record<"confirmed" | "false_positive" | "unbanned", string> = {
  confirmed: "resolved — auto-mod was correct",
  false_positive: "resolved — false automod",
  unbanned: "resolved — restriction lifted",
};

/** Trim the automatic-action prefixes so the feed shows the message. */
function stripPrefix(reason: string): string {
  if (reason.startsWith("[Automatic]")) return reason.slice("[Automatic]".length).trim();
  if (reason.startsWith("[Flood alert]")) return reason.slice("[Flood alert]".length).trim();
  return reason;
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

export default function AutomodCard() {
  const [events, setEvents] = useState<ModEvent[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/moderation");
      if (!res.ok) return;
      const data: { events?: ModEvent[] } = await res.json();
      setEvents(data.events ?? []);
    } catch {
      /* leave whatever we have */
    }
  }, []);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void load();
  }, [load]);

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
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const all = events ?? [];
  const unresolved = all.filter((e) => !e.resolved_at);
  const resolved = all.filter((e) => e.resolved_at);

  const count = (type: ModEvent["event_type"]) =>
    unresolved.filter((e) => e.event_type === type).length;

  const visible = showResolved ? all : unresolved;

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-900">Auto-mod</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Rating bursts on one combo — rating, re-rating or removing ratings — escalate from
            warnings to automatic timeouts. Rating different combos is unlimited. Posting is
            never blocked: more than 5 combos within an hour raises a flood alert for manual
            review. Comment floods follow the rating escalation. Alerts stay unresolved until an
            admin confirms the action or lifts the restriction.
          </p>
        </div>
        {events !== null && (
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
              {count("warning")} warning{count("warning") === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">
              {count("timeout")} timeout{count("timeout") === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">
              {count("flood")} flood{count("flood") === 1 ? "" : "s"}
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
        <p className="mt-4 text-sm text-slate-400">
          Auto-mod events load here. If nothing appears, the anti-spam migration may not be run
          yet (see supabase/anti-spam.sql).
        </p>
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
                ? "No automatic actions in the last 24 hours."
                : "Nothing unresolved — every alert has been handled."}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {visible.slice(0, 12).map((e) => (
                <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <span
                      className={
                        e.event_type === "timeout"
                          ? "mr-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700"
                          : e.event_type === "flood"
                            ? "mr-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700"
                            : "mr-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700"
                      }
                    >
                      {e.event_type}
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
                      {stripPrefix(e.reason)}
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
                          {busyId === e.id ? "Saving…" : "Correct — resolve"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === e.id}
                          onClick={() => void resolve(e, "false_positive")}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                        >
                          False automod — lift
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
