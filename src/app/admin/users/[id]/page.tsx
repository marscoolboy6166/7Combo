"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ConfirmModal, { type PendingConfirm } from "@/components/confirm-modal";
import { cn } from "@/lib/utils";

interface AdminUser {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  role: "user" | "moderator" | "admin" | "owner";
  is_test: boolean;
  created_at: string;
  ban_scope: "posting" | "rating" | "both" | null;
  ban_until: string | null;
  ban_reason: string | null;
  ban_at: string | null;
  appeal_status: "none" | "pending" | "denied" | "upheld" | null;
  appeal_text: string | null;
  appeal_at: string | null;
}

const SCOPE_OPTIONS = [
  { value: "posting", label: "Posting only", hint: "They can still rate" },
  { value: "rating", label: "Rating only", hint: "They can still post" },
  { value: "both", label: "Both", hint: "No posting, no rating" },
] as const;

const DURATION_OPTIONS = [
  { value: "1", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
  { value: "7d", label: "1 week" },
  { value: "30d", label: "30 days" },
  { value: "permanent", label: "Permanent ban" },
] as const;

function isActive(u: AdminUser): boolean {
  return Boolean(u.ban_scope) && (!u.ban_until || new Date(u.ban_until).getTime() > Date.now());
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "needs-migration" | "error">(
    "loading",
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<string | null>(null);

  // Ban form state
  const [scope, setScope] = useState<"posting" | "rating" | "both">("both");
  const [duration, setDuration] = useState<string>("7d");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/users?id=${params.id}`);
    if (res.status === 409) {
      setStatus("needs-migration");
      return;
    }
    if (!res.ok) {
      setErrorText("Failed to load this user.");
      setStatus("error");
      return;
    }
    const data = await res.json();
    setUser(data.user);
    setViewerId(data.viewerId ?? null);
    setViewerRole(data.viewerRole ?? null);
    setStatus("ready");
  }, [params.id]);

  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    load();
  }, [load]);

  function daysFor(value: string): number | null {
    if (value === "permanent") return null; // permanent = omit days
    if (value.endsWith("d")) return Number(value.slice(0, -1));
    if (value.endsWith("h")) return Number(value.slice(0, -1)) / 24;
    return Number(value);
  }

  async function ban(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const d = daysFor(duration);
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: user.id,
          action: "ban",
          scope,
          days: d,
          reason: reason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message ?? "Ban failed.");
        return;
      }
      setMessage(
        d === null
          ? `${user.display_name} is now permanently banned from ${scope}.`
          : `${user.display_name} is restricted from ${scope} for the selected duration.`,
      );
      setReason("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function act(body: Record<string, unknown>, okMessage: string) {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message ?? "Action failed.");
        return;
      }
      setMessage(okMessage);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return <p className="py-10 text-center text-sm text-slate-500">Loading user…</p>;
  }

  if (status === "needs-migration") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <h2 className="text-lg font-bold">Run the user-system SQL first</h2>
        <p className="mt-2">
          The ban columns don&apos;t exist yet — see the Users list page for the block to run.
        </p>
      </div>
    );
  }

  if (status === "error" || !user) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        <h2 className="text-lg font-bold">Couldn&apos;t load this user</h2>
        <p className="mt-2">{errorText}</p>
        <Link href="/admin/users" className="mt-3 inline-block rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">
          Back to Users
        </Link>
      </div>
    );
  }

  const currentlyBanned = isActive(user);

  return (
    <main>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight">Moderate user</h2>
        <Link href="/admin/users" className="text-sm text-emerald-700 hover:underline">
          Back to all members
        </Link>
      </div>

      {/* Identity card */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-bold text-slate-900">{user.display_name}</p>
              <span className="text-sm text-slate-500">@{user.username ?? "—"}</span>
              {user.role === "owner" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  OWNER
                </span>
              )}
              {user.role === "admin" && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  ADMIN
                </span>
              )}
              {user.role === "moderator" && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                  MODERATOR
                </span>
              )}
              {user.is_test && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  TEST ACCOUNT
                </span>
              )}
              {currentlyBanned && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                  {user.ban_until ? "TIMEOUT ACTIVE" : "PERMANENTLY BANNED"}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Joined {new Date(user.created_at).toLocaleDateString()} · id {user.id}
            </p>
          </div>
          <Link
            href={user.username ? `/u/${user.username}` : `/u/${user.id}`}
            className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View public profile
          </Link>
        </div>

        {currentlyBanned && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p>
              <strong>Active restriction:</strong> {user.ban_scope} —{" "}
              {user.ban_until
                ? `until ${new Date(user.ban_until).toLocaleString()}`
                : "permanent"}
            </p>
            <p className="mt-1 text-xs text-red-800">
              Reason shown to the user: {user.ban_reason?.trim() || "(generic text shown)"}
            </p>
          </div>
        )}
      </section>

      {message && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{message}</p>
      )}

      {/* Role + test-account management */}
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Role &amp; account status</h3>
        <p className="mt-1 text-xs text-slate-500">
          Moderators can manage the catalog and combos but never users or bans. The test-account
          flag is only a marker so you can tell which accounts you own — it grants no powers.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {user.role === "owner" || viewerId === user.id ? (
            <span className="text-xs font-semibold text-amber-700">
              {user.role === "owner"
                ? "assigned in DB — cannot be changed from the app"
                : "this is you — role changes are not possible on your own account"}
            </span>
          ) : (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Role
            <select
              value={user.role}
              disabled={busy}
              onChange={(e) => {
                const role = e.target.value as "user" | "moderator" | "admin";
                if (role === user.role) return;
                e.target.value = user.role; // revert until confirmed + reloaded
                setPending({
                  title: "Change this role?",
                  body:
                    role === "admin" ? (
                      <>
                        Give <strong>{user.display_name}</strong> full admin powers? Admins can
                        ban users, change roles, and manage everything.
                      </>
                    ) : (
                      <>
                        Set <strong>{user.display_name}</strong>&apos;s role to{" "}
                        <strong>{role}</strong>
                        {role === "moderator"
                          ? "? Moderators can manage products and combos but never users or bans."
                          : "?"}
                      </>
                    ),
                  confirmLabel: role === "admin" ? "Make admin" : `Set ${role}`,
                  danger: role === "admin",
                  onConfirm: () =>
                    act(
                      { action: "set_role", role },
                      `${user.display_name} is now ${role}.`,
                    ),
                });
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium focus:border-emerald-500 focus:outline-none disabled:opacity-60"
            >
              <option value="user">User</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void act(
                { action: "set_test", is_test: !user.is_test },
                user.is_test
                  ? `${user.display_name} unmarked as test account.`
                  : `${user.display_name} marked as an official test account.`,
              )
            }
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60",
              user.is_test
                ? "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                : "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
            )}
          >
            {user.is_test ? "Unmark test account" : "Mark as official test account"}
          </button>
        </div>
      </section>

      {/* Appeal review */}
      {user.appeal_status === "pending" && user.appeal_text && (
        <section className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-5">
          <h3 className="font-bold text-sky-900">Appeal awaiting your decision</h3>
          <p className="mt-2 whitespace-pre-wrap rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-800">
            {user.appeal_text}
          </p>
          <p className="mt-2 text-xs text-sky-800">
            This was their single appeal. Denying keeps the restriction and closes the case;
            upholding lifts the restriction.
          </p>
          <div className="mt-3 flex gap-2">
            {(user.role !== "admin" || viewerRole === "owner") && (
            <button
              disabled={busy}
              onClick={() =>
                act(
                  { action: "unban", appeal: "upheld" },
                  `${user.display_name}'s appeal upheld — restriction lifted.`,
                )
              }
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              Uphold appeal — lift restriction
            </button>
            )}
            {(user.role !== "admin" || viewerRole === "owner") && (
            <button
              disabled={busy}
              onClick={() =>
                act(
                  { action: "deny_appeal" },
                  `${user.display_name}'s appeal denied — restriction stays.`,
                )
              }
              className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
            >
              Deny appeal — keep restriction
            </button>
            )}
          </div>
        </section>
      )}

      {/* Ban / timeout form — the dedicated controls. Hidden whenever the
          viewer lacks permission: owner target (nobody can ban them), own
          row (self-ban), or admin target viewed by a non-owner admin. */}
      {user.role === "owner" || (user.role === "admin" && viewerRole !== "owner") ? (
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-slate-900">Not bannable</h3>
          <p className="mt-1 text-sm text-slate-500">
            {user.role === "owner"
              ? "The owner cannot be banned or timed out — by anyone."
              : viewerId === user.id
                ? "You cannot ban yourself."
                : "Only the owner can restrict admins. The database refuses it even if a request is crafted by hand."}
          </p>
        </section>
      ) : (
      <></>
      )}
      {user.role !== "owner" && !(user.role === "admin" && viewerRole !== "owner") && (
      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">
          {currentlyBanned ? "Change or replace restriction" : "Ban or timeout"}
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          A timeout expires on its own; a permanent ban does not. The reason you write is shown
          to the user on their restricted pages — leave it empty and they see a generic text.
        </p>

        <form onSubmit={ban} className="mt-4 space-y-4">
          <fieldset>
            <legend className="text-sm font-medium text-slate-600">Restrict from</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setScope(s.value)}
                  title={s.hint}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-semibold transition",
                    scope === s.value
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-slate-600">Duration</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDuration(d.value)}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-semibold transition",
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
          </fieldset>

          <label className="block text-sm font-medium text-slate-600">
            Reason (visible to the user — blank = generic text)
            <textarea
              rows={2}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Repeated spam; you may return after the timeout."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className={cn(
                "rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition disabled:opacity-60",
                duration === "permanent"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-amber-600 hover:bg-amber-700",
              )}
            >
              {busy
                ? "Applying…"
                : duration === "permanent"
                  ? `Ban permanently from ${scope}`
                  : `Apply timeout (${DURATION_OPTIONS.find((d) => d.value === duration)?.label})`}
            </button>
          </div>
        </form>
      </section>
      )}

      {/* Unban */}
      {currentlyBanned && (user.role !== "admin" || viewerRole === "owner") && (
        <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h3 className="font-bold text-emerald-900">Lift restriction</h3>
          <p className="mt-1 text-xs text-emerald-800">
            Removes the ban/timeout entirely. If they had already used their one appeal on this
            ban, a new ban would normally not grant a second one — lifting manually is the
            override.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              setPending({
                title: "Lift this restriction?",
                body: (
                  <>
                    The restriction on <strong>{user.display_name}</strong> will be removed
                    immediately — they can post and rate again.
                  </>
                ),
                confirmLabel: "Lift restriction",
                onConfirm: () =>
                  act({ action: "unban" }, `Restriction lifted for ${user.display_name}.`),
              })
            }
            className="mt-3 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            Lift restriction
          </button>
        </section>
      )}

      <ConfirmModal action={pending} onDone={() => setPending(null)} />
    </main>
  );
}
