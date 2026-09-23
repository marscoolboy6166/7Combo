"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Admin card: filter-appeal queue + phrase whitelist manager.
 * Approve tells the user their content was cleared (combos can be re-posted
 * by the user, or staff can post from the snapshot); whitelisting a phrase
 * makes the filter stop blocking profanity/spam matches for everyone.
 * Confirmations are in-app (two-step buttons), never native dialogs.
 */

interface Appeal {
  id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  kind: "combo" | "comment";
  status: "pending" | "approved" | "rejected";
  flagged_text: string;
  filter_reason: string;
  appeal_text: string;
  created_at: string;
  decided_at: string | null;
}

interface WhitelistEntry {
  id: string;
  phrase: string;
  created_at: string;
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

export default function FilterAppealsAdmin() {
  const [appeals, setAppeals] = useState<Appeal[] | null>(null);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [newPhrase, setNewPhrase] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWhitelist, setShowWhitelist] = useState(false);
  const ran = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/filter-appeals");
      if (!res.ok) {
        setAppeals([]);
        return;
      }
      const data = await res.json();
      setAppeals(data.appeals ?? []);
      setWhitelist(data.whitelist ?? []);
    } catch {
      setAppeals([]);
    }
  }, []);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    load();
  }, [load]);

  async function decide(appeal: Appeal, action: "approve" | "reject") {
    setBusyId(appeal.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/filter-appeals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: appeal.id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Decision failed.");
        return;
      }
      setNotice(
        action === "approve"
          ? "Appeal approved — the user can repost, or whitelist the phrase below so it never flags again."
          : "Appeal rejected — the filter decision stands.",
      );
      await load();
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  }

  async function addPhrase() {
    const phrase = newPhrase.trim();
    if (phrase.length < 2) return;
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/filter-appeals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phrase }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.message ?? "Could not add the phrase.");
      return;
    }
    setNewPhrase("");
    setNotice(`"${phrase}" is now whitelisted — the filter will stop blocking it.`);
    await load();
  }

  async function removePhrase(id: string) {
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/admin/filter-appeals?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? "Could not remove the phrase.");
      return;
    }
    setNotice("Phrase removed — the filter checks it again.");
    await load();
  }

  const pending = (appeals ?? []).filter((a) => a.status === "pending");
  const decided = (appeals ?? []).filter((a) => a.status !== "pending");

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-900">Filter appeals</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Users can contest friendly-content-filter rejections here. Approving clears the user;
            whitelisting a phrase stops the filter blocking it for everyone.
          </p>
        </div>
        {appeals !== null && (
          <span
            className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
              pending.length > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500",
            )}
          >
            {pending.length} pending
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

      {appeals === null ? (
        <p className="mt-4 text-sm text-slate-400">
          Loading appeals… If this never loads, the filter-appeals migration has not been run yet
          (see supabase/filter-appeals.sql).
        </p>
      ) : appeals.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No appeals yet — either the filter is behaving or nobody has contested it.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {pending.map((a) => (
            <li key={a.id} className="py-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                  {a.kind}
                </span>
                <Link
                  href={`/admin/users/${a.user_id}`}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  {a.display_name ?? "Unknown user"}
                </Link>
                {a.username && <span className="text-slate-400">@{a.username}</span>}
                <span className="ml-auto text-xs text-slate-400">{timeAgo(a.created_at)}</span>
              </div>

              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                flagged text
              </p>
              <p className="mt-0.5 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {a.flagged_text}
              </p>
              <p className="mt-1 text-xs text-slate-500">Filter said: {a.filter_reason}</p>

              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                their appeal
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{a.appeal_text}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {confirmId === a.id ? (
                  <>
                    <button
                      onClick={() => decide(a, "approve")}
                      disabled={busyId === a.id}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {busyId === a.id ? "Working…" : "Yes, approve appeal"}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setConfirmId(a.id)}
                      className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => decide(a, "reject")}
                      disabled={busyId === a.id}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => {
                        setNewPhrase(a.flagged_text.slice(0, 100));
                        setShowWhitelist(true);
                      }}
                      className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                      title="Prefill the whitelist box with the flagged text"
                    >
                      Whitelist this phrase
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
          {decided.length > 0 && (
            <li className="py-3 text-xs text-slate-400">
              {decided.length} earlier appeal{decided.length === 1 ? "" : "s"} already decided
              ({decided.filter((d) => d.status === "approved").length} approved,{" "}
              {decided.filter((d) => d.status === "rejected").length} rejected).
            </li>
          )}
        </ul>
      )}

      {/* ---- whitelist manager ---- */}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <button
          onClick={() => setShowWhitelist((v) => !v)}
          className="text-xs font-semibold text-slate-500 hover:text-slate-700"
        >
          {showWhitelist ? "Hide whitelist" : `Whitelist (${whitelist.length})`}
        </button>

        {showWhitelist && (
          <div className="mt-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newPhrase}
                onChange={(e) => setNewPhrase(e.target.value)}
                placeholder="Exact phrase to allow forever…"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
              <button
                onClick={addPhrase}
                disabled={newPhrase.trim().length < 2}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                Whitelist
              </button>
            </div>
            {whitelist.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {whitelist.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                  >
                    <span className="max-w-[16rem] truncate font-medium">{w.phrase}</span>
                    <button
                      onClick={() => removePhrase(w.id)}
                      className="text-slate-400 hover:text-red-600"
                      aria-label={`Remove ${w.phrase}`}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
