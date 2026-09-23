"use client";

import { useState } from "react";

/**
 * Appeal flow for friendly-content-filter rejections. Shown under the
 * error message when the API returns a `filterFlag` payload: the user
 * explains the mistake, a moderator reviews it in the admin area and can
 * approve the content or whitelist the phrase so it never blocks again.
 */
export default function FilterAppealBox({
  kind,
  flaggedText,
  filterReason,
  context,
}: {
  kind: "combo" | "comment";
  flaggedText: string;
  filterReason: string;
  context?: unknown;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy || text.trim().length < 10) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/filter-appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          flaggedText,
          filterReason,
          context: context ?? null,
          appealText: text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Could not submit the appeal.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not submit the appeal.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
        Appeal submitted — a moderator will review it soon.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-semibold text-slate-500 underline decoration-dotted hover:text-slate-700"
      >
        Was this a mistake? Appeal to a moderator
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-600">
        Tell us what happened — if the filter got it wrong, a moderator can approve your content
        and whitelist the phrase so it never gets flagged again.
      </p>
      <textarea
        rows={3}
        maxLength={1000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write at least 10 characters…"
        className="mt-2 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs focus:border-emerald-500 focus:outline-none"
      />
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={busy || text.trim().length < 10}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send appeal"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
