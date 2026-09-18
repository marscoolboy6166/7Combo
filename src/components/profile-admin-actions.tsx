"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const DURATION_OPTIONS = [
  { value: "1h", label: "1 hour", days: 1 / 24 },
  { value: "1d", label: "1 day", days: 1 },
  { value: "7d", label: "1 week", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "permanent", label: "Permanent ban", days: null },
] as const;

/**
 * Visible only to admins, on public profile pages: a Ban/timeout quick
 * action. Hidden entirely for admin and owner targets (admins cannot ban
 * admins or themselves — the database refuses it too). The full management
 * page remains at /admin/users/<id>.
 */
export default function ProfileAdminActions({
  userId,
  targetRole,
}: {
  userId: string;
  targetRole: "user" | "moderator" | "admin" | "owner";
}) {
  const [session, setSession] = useState<{ role: string | null; viewerId: string | null } | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"posting" | "rating" | "both">("both");
  const [duration, setDuration] = useState<string>("7d");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((r) => r.json())
      .then((data: { role?: string | null; viewerId?: string | null }) =>
        setSession({ role: data.role ?? null, viewerId: data.viewerId ?? null }),
      )
      .catch(() => setSession(null));
  }, []);

  // Hidden unless: viewer is staff, target isn't the viewer, and — for admin
  // targets — viewer is the owner. DB enforces the same rules underneath.
  const role = session?.role;
  const isSelf = session?.viewerId === userId;
  if (!role) return null;
  if (isSelf || targetRole === "owner") return null;
  if (targetRole === "admin" && role !== "owner") return null;

  async function ban(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const d = DURATION_OPTIONS.find((x) => x.value === duration);
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userId,
          action: "ban",
          scope,
          days: d?.days ?? null,
          reason: reason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.message ?? "Ban failed.");
        return;
      }
      setMsg(
        d?.days === null
          ? `Permanently banned from ${scope}.`
          : `Timeout applied: ${d?.label} from ${scope}.`,
      );
      setReason("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "rounded-xl px-3.5 py-2 text-xs font-semibold transition",
            open
              ? "bg-slate-900 text-white"
              : "border border-red-200 bg-white text-red-600 hover:bg-red-50",
          )}
        >
          Ban / timeout
        </button>
        <Link
          href={`/admin/users/${userId}`}
          className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Full management
        </Link>
      </div>

      {open && (
        <form
          onSubmit={ban}
          className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Quick restriction
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["posting", "rating", "both"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-semibold transition",
                  scope === s
                    ? "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {s === "posting" ? "Posting only" : s === "rating" ? "Rating only" : "Both"}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDuration(d.value)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-xs font-semibold transition",
                  duration === d.value
                    ? d.value === "permanent"
                      ? "bg-red-600 text-white"
                      : "bg-slate-900 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          <textarea
            rows={2}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (visible to the user — blank = generic text)"
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className={cn(
                "rounded-xl px-5 py-2 text-xs font-semibold text-white transition disabled:opacity-60",
                duration === "permanent"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-amber-600 hover:bg-amber-700",
              )}
            >
              {busy ? "Applying…" : "Apply"}
            </button>
            {err && <span className="text-xs font-medium text-red-700">{err}</span>}
            {msg && <span className="text-xs font-medium text-emerald-700">{msg}</span>}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            They get exactly one appeal, shown on their restricted pages and your Users admin.
          </p>
        </form>
      )}
    </div>
  );
}
