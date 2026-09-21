"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ModEvent {
  id: number;
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_test: boolean | null;
  event_type: "warning" | "timeout";
  action: "post" | "rate";
  scope: "posting" | "rating";
  reason: string;
  until: string | null;
  expires_at: string;
  created_at: string;
}

const ACK_KEY = "7combo-modpopup-ack";
const REFRESH_MS = 120_000; // silent background refresh every 2 min

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
 * Mounted once in the admin layout. On first load of any admin page it
 * fetches recent automatic moderation events; when there are any, a
 * dismissible popup lists them (who, what, when) with links to each
 * user's manage page. The dismissal is remembered per latest event id,
 * so genuinely new activity re-opens it. Refreshes quietly in the
 * background while an admin tab stays open.
 */
export default function ModerationPopup() {
  const [events, setEvents] = useState<ModEvent[] | null>(null);
  const [open, setOpen] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let timer: ReturnType<typeof setInterval> | null = null;
    let latestId = 0;

    const load = async (first: boolean) => {
      try {
        const res = await fetch("/api/admin/moderation");
        if (!res.ok) return; // silent: popup is a convenience, not a gate
        const data: { events?: ModEvent[] } = await res.json();
        const list = data.events ?? [];
        setEvents(list);
        const maxId = list.reduce((m, e) => Math.max(m, e.id), 0);

        let acked = 0;
        try {
          acked = Number(localStorage.getItem(ACK_KEY) ?? "0");
        } catch {
          /* private mode: always show */
        }

        if (first) {
          if (list.length > 0 && maxId > acked) setOpen(true);
        } else if (maxId > latestId && maxId > acked) {
          setOpen(true); // genuinely new activity re-opens the popup
        }
        latestId = maxId;
      } catch {
        /* network hiccup — retry on next tick */
      }
    };

    load(true);
    timer = setInterval(() => load(false), REFRESH_MS);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  function dismiss() {
    try {
      const maxId = (events ?? []).reduce((m, e) => Math.max(m, e.id), 0);
      localStorage.setItem(ACK_KEY, String(maxId));
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open || !events || events.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Recent automatic moderation actions"
    >
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Auto-mod activity</h3>
            <p className="mt-1 text-xs text-slate-500">
              Warnings and automatic timeouts handed out by the anti-spam system (last 24h).
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <ul className="mt-4 space-y-3">
          {events.map((e) => {
            const strip = e.reason.startsWith("[Automatic]")
              ? e.reason.slice("[Automatic]".length).trim()
              : e.reason;
            return (
              <li
                key={e.id}
                className={cn(
                  "rounded-xl border p-3",
                  e.event_type === "timeout"
                    ? "border-red-200 bg-red-50"
                    : "border-amber-200 bg-amber-50",
                )}
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-bold uppercase tracking-wide",
                      e.event_type === "timeout"
                        ? "bg-red-600 text-white"
                        : "bg-amber-500 text-white",
                    )}
                  >
                    {e.event_type === "timeout" ? "Auto-timeout" : "Warning"}
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
                </div>

                <p className="mt-2 text-sm text-slate-700">
                  <Link
                    href={`/admin/users/${e.user_id}`}
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    {e.display_name ?? "Unknown user"}
                  </Link>
                  {e.username ? (
                    <span className="text-slate-400"> @{e.username}</span>
                  ) : null}
                </p>
                <p className="mt-1 line-clamp-3 text-xs text-slate-600">{strip}</p>
                {e.event_type === "timeout" && e.until && (
                  <p className="mt-1 text-xs font-medium text-red-700">
                    Until {new Date(e.until).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            onClick={dismiss}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
