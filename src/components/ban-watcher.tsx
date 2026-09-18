"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MyBan } from "@/lib/types";

const ACK_KEY = "7combo-ban-ack";
const POLL_MS = 30_000;
const REFOCUS_THROTTLE_MS = 10_000;

function ackKey(ban: MyBan): string {
  return `${ban.scope ?? "both"}|${ban.until ?? "permanent"}`;
}

function isAcknowledged(ban: MyBan): boolean {
  try {
    const raw = localStorage.getItem(ACK_KEY);
    return raw === ackKey(ban);
  } catch {
    return false;
  }
}

/**
 * Mounted once in the root layout. Checks the signed-in user's ban state
 * on load, on tab refocus, and on a short poll — the moment a restriction
 * is active, a modal pops up with the reason and the single-appeal form.
 * Dismissing is remembered per ban (same scope + deadline won't nag again),
 * but a new or changed restriction pops up fresh.
 */
export default function BanWatcher() {
  const [ban, setBan] = useState<MyBan | null>(null);
  const [show, setShow] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const signedInRef = useRef(false);
  const lastCheckRef = useRef(0);
  const banRef = useRef<MyBan | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/me/ban");
      const data: MyBan & { signedIn?: boolean } = await res.json();
      signedInRef.current = Boolean(data.signedIn);

      if (!data.banned) {
        // Unbanned (or freshly signed out): close an open popup.
        setBan(null);
        if (banRef.current) setShow(false);
        banRef.current = null;
        return;
      }

      const prev = banRef.current;
      banRef.current = data;
      setBan(data);

      // Pop when a restriction is first seen, and again when it changes
      // (different scope/deadline) — but not on every poll.
      if (!prev || ackKey(prev) !== ackKey(data)) {
        if (!isAcknowledged(data)) setShow(true);
      }
    } catch {
      // Network hiccup: try again on the next tick.
    }
  }, []);

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    // Deferred so the effect body stays synchronous-clean.
    const firstCheck = setTimeout(check, 0);

    function startPolling() {
      if (!pollTimer) pollTimer = setInterval(check, POLL_MS);
    }

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastCheckRef.current < REFOCUS_THROTTLE_MS) return;
      lastCheckRef.current = now;
      if (signedInRef.current) check();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // Start polling only after we know the visitor is signed in.
    const t = setTimeout(() => {
      if (signedInRef.current) startPolling();
    }, POLL_MS);

    return () => {
      clearTimeout(firstCheck);
      clearTimeout(t);
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [check]);

  async function submitAppeal(e: React.FormEvent) {
    e.preventDefault();
    if (!ban) return;
    setBusy(true);
    setError(null);
    setNotice(null);
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
      setNotice(data.message ?? "Appeal submitted.");
      setAppealText("");
      await check(); // refresh appeal status inside the popup
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    if (ban) {
      try {
        localStorage.setItem(ACK_KEY, ackKey(ban));
      } catch {
        // Private mode etc. — popup will reappear on next visit; fine.
      }
    }
    setShow(false);
  }

  if (!ban || !show) return null;

  const scopeText =
    ban.scope === "posting"
      ? "posting combos"
      : ban.scope === "rating"
        ? "rating combos"
        : "posting and rating combos";
  const untilText = ban.until
    ? new Date(ban.until).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Account restriction notice"
    >
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl">
        <h3 className="text-lg font-bold text-red-900">Your account is restricted</h3>
        <p className="mt-2 text-sm text-slate-700">
          You are restricted from <strong>{scopeText}</strong>
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
        <p className="mt-2 text-sm text-slate-600">
          {ban.reason?.trim()
            ? `Reason: ${ban.reason}`
            : "No specific reason was given. If you believe this is a mistake, you may submit your one appeal below."}
        </p>

        {ban.appeal_status === "none" ? (
          <form onSubmit={submitAppeal} className="mt-4 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold text-slate-700">
              You have exactly one appeal — once submitted, it cannot be undone or repeated.
            </p>
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              value={appealText}
              onChange={(e) => setAppealText(e.target.value)}
              placeholder="Explain why this restriction should be lifted (10–2000 characters)…"
              className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy ? "Submitting…" : "Submit my one appeal"}
              </button>
              {error && <span className="text-xs font-medium text-red-700">{error}</span>}
              {notice && <span className="text-xs font-medium text-emerald-700">{notice}</span>}
            </div>
          </form>
        ) : ban.appeal_status === "pending" ? (
          <p className="mt-4 border-t border-slate-200 pt-4 text-sm font-medium text-slate-700">
            Your one appeal has been submitted and is being reviewed. The decision is final.
          </p>
        ) : ban.appeal_status === "denied" ? (
          <p className="mt-4 border-t border-slate-200 pt-4 text-sm font-medium text-slate-700">
            Your one appeal was reviewed and denied. The decision is final.
          </p>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            onClick={dismiss}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
