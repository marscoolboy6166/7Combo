"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

/**
 * Report a bug (roadmap #5 — site necessities pack).
 * Signed-in users describe what broke; the page they were on is
 * captured automatically and editable. Reports land in the staff
 * queue (/admin/reports). The user's own report history (with
 * staff replies) shows below the form.
 */

interface ReportRow {
  id: string;
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

export default function ReportPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const ranRef = useRef(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setSignedIn(false);
      return;
    }
    setSignedIn(true);
    const { data: history } = await supabase.rpc("my_bug_reports");
    setReports((history ?? []) as unknown as ReportRow[]);
  }, []);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    // Capture the page the user is on — most useful detail in a
    // bug report, and the one people forget to include.
    setPageUrl(window.location.href);
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const desc = description.trim();
    if (desc.length < 10) {
      setMessage({ kind: "err", text: "Please describe the bug in at least 10 characters." });
      return;
    }
    if (desc.length > 2000) {
      setMessage({ kind: "err", text: "Reports are limited to 2000 characters." });
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl: pageUrl.trim(), description: desc }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "err", text: data.message ?? "Could not submit the report." });
        return;
      }
      setMessage({ kind: "ok", text: data.message ?? "Report submitted." });
      setDescription("");
      await load();
    } finally {
      setSending(false);
    }
  }

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-sm text-amber-800">
          <p className="text-3xl">🛠️</p>
          <h1 className="mt-2 text-lg font-bold">Supabase is not connected yet</h1>
          <p className="mt-2">{NOT_CONFIGURED_MESSAGE}</p>
        </div>
      </main>
    );
  }

  if (signedIn === false) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <span className="text-5xl">🐞</span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Sign in to report a bug</h1>
          <p className="mt-2 text-sm text-slate-500">
            Reports go straight to the staff queue. Sign in so we can follow up
            if we need more detail.
          </p>
          <Link
            href="/login?next=/report"
            className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Report a bug</h1>
      <p className="mt-1 text-sm text-slate-500">
        Something broken, confusing, or wrong? Tell us — it goes straight to the
        staff queue, and we&apos;ll mark it resolved when it&apos;s fixed.
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="text-sm font-medium text-slate-600">
          Page where it happened
          <input
            type="url"
            value={pageUrl}
            onChange={(e) => setPageUrl(e.target.value)}
            placeholder="https://7-combo.vercel.app/…"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-400">
            Filled in automatically — edit it if the bug is somewhere else.
          </span>
        </label>

        <label className="text-sm font-medium text-slate-600">
          What&apos;s wrong?
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. The rating widget shows 0 stars after I rate, and the count doesn't change…"
            className="mt-1 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-slate-400">
            10–2000 characters. Include what you expected and what happened instead.
          </span>
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={sending}
            className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {sending ? "Sending…" : "Submit report"}
          </button>
          {message && (
            <span
              className={cn(
                "text-sm",
                message.kind === "ok" ? "text-emerald-700" : "text-red-600",
              )}
            >
              {message.text}
            </span>
          )}
        </div>
      </form>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your reports
        </h2>
        {reports === null ? (
          <p className="mt-2 text-sm text-slate-400">Loading…</p>
        ) : reports.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Nothing yet — if something feels off, that&apos;s worth a report.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {reports.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-bold uppercase",
                      r.status === "open"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700",
                    )}
                  >
                    {r.status}
                  </span>
                  {r.page_url && (
                    <span className="max-w-full truncate text-slate-400" title={r.page_url}>
                      {r.page_url}
                    </span>
                  )}
                  <span className="ml-auto text-slate-400">{timeAgo(r.created_at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{r.description}</p>
                {r.staff_note && (
                  <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Staff: {r.staff_note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-center text-xs text-slate-400">
        Not a bug? General questions live on the{" "}
        <Link href="/faq" className="text-emerald-700 hover:underline">
          FAQ page
        </Link>
        .
      </p>
    </main>
  );
}
