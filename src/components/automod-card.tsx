"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * Auto-mod card: recent anti-spam actions (warnings / automatic timeouts)
 * fed by /api/admin/moderation. Rendered inside the admin Users page —
 * moderation and user management live together.
 */

interface ModEvent {
  id: number;
  user_id: string;
  display_name: string | null;
  username: string | null;
  event_type: "warning" | "timeout";
  action: "post" | "rate" | "comment";
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

export default function AutomodCard() {
  const [events, setEvents] = useState<ModEvent[] | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
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
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-900">Auto-mod</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Anti-spam: 3 posts/hour with warnings, then automatic timeouts. Rating different
            combos is unlimited; rapid re-rating of one combo is limited. Comment floods follow
            the same escalation.
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
  );
}
