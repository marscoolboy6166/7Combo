"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Admin card: bug-report queue (roadmap #5 — site necessities pack).
 * Reports users filed at /report land here, open first. Resolving
 * marks the report resolved and can leave a note the reporter sees
 * on their own reports list. Confirmations are in-app (two-step
 * buttons), never native dialogs. Text-only, like the rest of
 * the admin area.
 */

interface Report {
  id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  page_url: string | null;
  description: string;
  status: string;
  staff_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function BugReportsAdmin() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reports");
      if (res.status === 403) {
        setAccessDenied(true);
        return;
      }
      if (!res.ok) {
        setError("Could not load the queue. Please try again.");
        return;
      }
      const data = await res.json();
      setReports(data.reports ?? []);
      setMigrationNeeded(Boolean(data.migrationNeeded));
    } catch {
      setError("Could not load the queue. Please try again.");
    }
  }, []);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    load();
  }, [load]);

  async function resolve(id: string) {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, note: note.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Could not resolve the report.");
        return;
      }
      setNotice("Report resolved — the reporter sees your note on their history.");
      setResolvingId(null);
      setNote("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (accessDenied) {
    return (
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Bug reports</h3>
        <p className="mt-2 text-sm text-slate-500">
          Staff only. Ask an admin or the owner for moderator access to review
          bug reports.
        </p>
      </section>
    );
  }

  const open = (reports ?? []).filter((r) => r.status === "open");
  const resolved = (reports ?? []).filter((r) => r.status !== "open");

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-900">Bug reports</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Reports users filed at /report, with the page they were on. Resolve
            with an optional note — the reporter sees it on their own history.
          </p>
        </div>
        {reports !== null && (
          <span
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
              open.length > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500",
            )}
          >
            {open.length} open
          </span>
        )}
      </div>

      {notice && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}

      {migrationNeeded && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <p className="font-semibold">One-time setup: run the bug-report SQL</p>
          <p className="mt-1">
            The <code>bug_reports</code> table is not in the database yet. Paste{" "}
            <code>supabase/site-necessities.sql</code> into Supabase → SQL Editor → Run,
            then reload this page.
          </p>
        </div>
      )}

      {reports === null ? (
        <p className="mt-4 text-sm text-slate-400">Loading reports…</p>
      ) : open.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          Queue is clear — no open reports.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {open.map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                  open
                </span>
                <Link
                  href={`/admin/users/${r.user_id}`}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  {r.display_name ?? "Unknown user"}
                </Link>
                {r.username && <span className="text-slate-400">@{r.username}</span>}
                <span className="ml-auto text-xs text-slate-400">
                  {timeAgo(r.created_at)}
                </span>
              </div>

              {r.page_url && (
                <p className="mt-1.5 text-xs text-slate-500">
                  <span className="font-semibold uppercase tracking-wide text-slate-400">
                    page:{" "}
                  </span>
                  <span className="break-all">{r.page_url}</span>
                </p>
              )}
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {r.description}
              </p>

              <div className="mt-3">
                {resolvingId === r.id ? (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-slate-500">
                      Note for the reporter (optional — shown on their report
                      history)
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="e.g. Fixed in today's deploy — thanks for the report!"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                      />
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => resolve(r.id)}
                        disabled={busyId === r.id}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busyId === r.id ? "Resolving…" : "Yes, mark resolved"}
                      </button>
                      <button
                        onClick={() => {
                          setResolvingId(null);
                          setNote("");
                        }}
                        className="text-xs text-slate-500 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setResolvingId(r.id)}
                    className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <button
            onClick={() => setShowResolved((v) => !v)}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            {showResolved
              ? "Hide resolved"
              : `Resolved (${resolved.length})`}
          </button>
          {showResolved && (
            <ul className="mt-3 divide-y divide-slate-100">
              {resolved.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold uppercase text-emerald-700">
                      resolved
                    </span>
                    <span className="font-medium text-slate-600">
                      {r.display_name ?? "Unknown user"}
                    </span>
                    {r.page_url && (
                      <span className="max-w-full truncate text-slate-400" title={r.page_url}>
                        {r.page_url}
                      </span>
                    )}
                    <span className="ml-auto text-slate-400">
                      {timeAgo(r.resolved_at ?? r.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600">
                    {r.description}
                  </p>
                  {r.staff_note && (
                    <p className="mt-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      Staff: {r.staff_note}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
