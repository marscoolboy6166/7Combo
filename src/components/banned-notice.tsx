"use client";

import { useEffect, useState } from "react";
import type { MyBan } from "@/lib/types";

/**
 * Full notice shown to a banned user (on /submit and in the rating flow).
 * Displays scope, deadline, the admin's reason (or a generic one), appeal
 * state, and — until used — THE one appeal form. The single-appeal rule is
 * stated explicitly. The scope comes from /api/me/ban itself.
 */
export default function BannedNotice() {
  const [ban, setBan] = useState<MyBan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/ban")
      .then((r) => r.json())
      .then((data: MyBan) => setBan(data))
      .catch(() => setBan(null))
      .finally(() => setLoaded(true));
  }, []);

  async function submitAppeal(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/me/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: appealText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Could not submit appeal.");
        return;
      }
      setMessage(data.message ?? "Appeal submitted.");
      const fresh = await fetch("/api/me/ban").then((r) => r.json());
      setBan(fresh);
      setAppealText("");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  if (!ban?.banned) return null;

  const scopeText =
    ban.scope === "posting"
      ? "posting combos"
      : ban.scope === "rating"
        ? "rating combos"
        : "posting and rating combos";

  const untilText = ban.until
    ? new Date(ban.until).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
      <h3 className="text-lg font-bold">Your account is restricted</h3>
      <p className="mt-2">
        You are currently restricted from <strong>{scopeText}</strong>
        {untilText ? (
          <>
            {" "}
            until <strong>{untilText}</strong>
          </>
        ) : (
          " permanently"
        )}
        .
      </p>
      <p className="mt-2 text-red-800">
        {ban.reason?.trim()
          ? `Reason: ${ban.reason}`
          : "No specific reason was given. If you believe this is a mistake, you may submit your one appeal below."}
      </p>

      {ban.appeal_status === "none" ? (
        <form onSubmit={submitAppeal} className="mt-4 border-t border-red-200 pt-4">
          <p className="font-semibold">
            You have exactly one appeal. Once submitted, it cannot be undone or repeated.
          </p>
          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={appealText}
            onChange={(e) => setAppealText(e.target.value)}
            placeholder="Explain why this restriction should be lifted (10–2000 characters)…"
            className="mt-2 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-red-400 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
            >
              {busy ? "Submitting…" : "Submit my one appeal"}
            </button>
            {error && <span className="text-xs font-medium text-red-700">{error}</span>}
            {message && <span className="text-xs font-medium text-emerald-700">{message}</span>}
          </div>
        </form>
      ) : ban.appeal_status === "pending" ? (
        <p className="mt-4 border-t border-red-200 pt-4 font-medium">
          Your one appeal has been submitted and is being reviewed. A decision is final.
        </p>
      ) : ban.appeal_status === "denied" ? (
        <p className="mt-4 border-t border-red-200 pt-4 font-medium">
          Your one appeal was reviewed and denied. The decision is final.
        </p>
      ) : null}
    </div>
  );
}
