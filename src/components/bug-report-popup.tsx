"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Report {
  id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  page_url: string | null;
  description: string;
  status: "open" | "resolved";
  staff_note: string | null;
  created_at: string;
  resolved_at: string | null;
  /** How many times this staff member has already been shown the report (max 3). */
  seen_count: number;
}

const REMINDERS = 3;

const REFRESH_MS = 180_000;

/**
 * Open, and not yet shown to this staff member three times. `seen_count` is
 * coerced so an older database shape (no counter yet) still shows the alert
 * instead of silently suppressing it.
 */
function isPending(r: Report): boolean {
  const seen = Number.isFinite(r.seen_count) ? r.seen_count : 0;
  return r.status === "open" && seen < REMINDERS;
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
 * Mounted once in the admin layout. Each new bug report pops up THREE times
 * for every staff member (enough warnings to act on it) before staying quiet
 * for them; the counter is personal and stored in the database. Resolving a
 * report — owner only — closes it for everyone.
 */
export default function BugReportPopup() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shownIds = useRef<string[]>([]);
  const ran = useRef(false);

  const show = useCallback((list: Report[]) => {
    const pending = list.filter(isPending);
    shownIds.current = pending.map((r) => r.id);
    if (pending.length > 0) setOpen(true);
  }, []);

  useEffect(() => {
    // Resolving is owner-only; staff still see the alert so they can flag it.
    fetch("/api/admin/session")
      .then((r) => r.json())
      .then((d: { role?: string | null }) => setRole(d.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const res = await fetch("/api/admin/reports");
        if (!res.ok) return;
        const data: { reports?: Report[] } = await res.json();
        const list = data.reports ?? [];
        setReports(list);
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
      await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ack", ids }),
      }).catch(() => {});
    }
  }

  async function resolve(r: Report) {
    setBusyId(r.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Could not resolve this report.");
        return;
      }
      const remaining = (reports ?? []).filter((x) => x.id !== r.id);
      setReports(remaining);
      const pending = remaining.filter(isPending);
      shownIds.current = pending.map((x) => x.id);
      if (pending.length === 0) setOpen(false);
    } finally {
      setBusyId(null);
    }
  }

  const pendingNow = (reports ?? []).filter(isPending);
  if (!open || !reports || pendingNow.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="New bug reports"
    >
      <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">New bug reports</h3>
            <p className="mt-1 text-xs text-slate-500">
              {pendingNow.length} report{pendingNow.length === 1 ? "" : "s"} worth a look. Each
              report reminds you up to {REMINDERS} times before it goes quiet for you — closing
              counts as one. {role === "owner"
                ? "Resolve the ones you fix."
                : "Only the site owner can resolve these — let them know what you find."}
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
          {pendingNow.map((r) => (
            <li key={r.id} className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-sky-600 px-2 py-0.5 font-bold uppercase tracking-wide text-white">
                  bug report
                </span>
                <span className="text-slate-500">{timeAgo(r.created_at)}</span>
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                  unresolved
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">
                  reminder {Math.min(Number.isFinite(r.seen_count) ? r.seen_count : 0, REMINDERS - 1) + 1} of {REMINDERS}
                </span>
              </div>

              <p className="mt-2 text-sm text-slate-700">
                <Link
                  href={`/admin/users/${r.user_id}`}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  {r.display_name ?? "Unknown user"}
                </Link>
                {r.username ? <span className="text-slate-400"> @{r.username}</span> : null}
              </p>
              {r.page_url && (
                <p className="mt-0.5 break-all text-[11px] text-slate-500">
                  <span className="font-semibold uppercase tracking-wide text-slate-400">page: </span>
                  {r.page_url}
                </p>
              )}
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap rounded-lg bg-white/70 px-2 py-1 text-xs text-slate-700">
                {r.description}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">
                {role === "owner" && (
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void resolve(r)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {busyId === r.id ? "Saving…" : "Mark resolved"}
                  </button>
                )}
                <Link
                  href="/admin/reports"
                  onClick={() => void dismiss()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Open queue
                </Link>
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
