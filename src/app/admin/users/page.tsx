"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  appeal_status: "none" | "pending" | "denied" | "upheld" | null;
  appeal_text: string | null;
  appeal_at: string | null;
}

type Filter = "all" | "banned" | "appeals";

function banStatus(u: AdminUser, now: number): { label: string; cls: string } {
  const active =
    u.ban_scope && (!u.ban_until || new Date(u.ban_until).getTime() > now);
  if (!active) return { label: "Active", cls: "bg-emerald-100 text-emerald-700" };
  return u.ban_until
    ? { label: "Timeout", cls: "bg-amber-100 text-amber-700" }
    : { label: "Banned", cls: "bg-red-100 text-red-700" };
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "needs-migration" | "error">(
    "loading",
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<string | null>(null);
  // Captured once per data load so render stays pure (react-hooks/purity).
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (res.status === 409) {
      setStatus("needs-migration");
      return;
    }
    if (!res.ok) {
      setErrorText("Failed to load users.");
      setStatus("error");
      return;
    }
    const data = await res.json();
    setUsers(data.users ?? []);
    setViewerId(data.viewerId ?? null);
    setViewerRole(data.viewerRole ?? null);
    setNow(Date.now());
    setStatus("ready");
  }, []);

  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    load();
  }, [load]);

  const filtered = users.filter((u) => {
    const needle = query.trim().toLowerCase();
    const matches =
      !needle ||
      u.display_name.toLowerCase().includes(needle) ||
      (u.username ?? "").toLowerCase().includes(needle);
    if (!matches) return false;
    if (filter === "banned") {
      return Boolean(u.ban_scope) && (!u.ban_until || new Date(u.ban_until).getTime() > now);
    }
    if (filter === "appeals") return u.appeal_status === "pending";
    return true;
  });

  const activeCount = users.filter(
    (u) => Boolean(u.ban_scope) && (!u.ban_until || new Date(u.ban_until).getTime() > now),
  ).length;
  const pendingAppeals = users.filter((u) => u.appeal_status === "pending").length;

  function askUnban(u: AdminUser) {
    setPending({
      title: "Lift this restriction?",
      body: (
        <>
          The restriction on <strong>{u.display_name}</strong> will be removed immediately —
          they can post and rate again.
        </>
      ),
      confirmLabel: "Lift restriction",
      onConfirm: async () => {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: u.id, action: "unban" }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.message ?? "Unban failed.");
          return;
        }
        setMessage(`Restriction lifted for ${u.display_name}.`);
        await load();
      },
    });
  }

  if (status === "loading") {
    return <p className="py-10 text-center text-sm text-slate-500">Loading members…</p>;
  }

  if (status === "needs-migration") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <h2 className="text-lg font-bold">One quick step: run the user-system SQL</h2>
        <p className="mt-2">
          The ban columns don&apos;t exist yet. Paste the user-system block from{" "}
          <code>supabase/schema.sql</code> (the section titled “User system: bans/timeouts + one-
          appeal system”) into Supabase → SQL Editor and run it, then reload this page.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        <h2 className="text-lg font-bold">Couldn&apos;t load members</h2>
        <p className="mt-2">{errorText}</p>
        <button onClick={load} className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">
          Retry
        </button>
      </div>
    );
  }

  return (
    <main>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold tracking-tight">Users</h2>
        <span className="text-sm text-slate-500">
          {users.length} members · {activeCount} restricted · {pendingAppeals} pending appeal
          {pendingAppeals === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or username…"
            className="w-56 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          {(
            [
              ["all", `All (${users.length})`],
              ["banned", `Restricted (${activeCount})`],
              ["appeals", `Appeals (${pendingAppeals})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-semibold transition",
                filter === value
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{message}</p>
      )}

      <div className="mt-4 space-y-3">
        {filtered.map((u) => {
          const badge = banStatus(u, now);
          return (
            <div
              key={u.id}
              className={cn(
                "rounded-2xl border bg-white p-4 shadow-sm",
                badge.label !== "Active" ? "border-red-200" : "border-slate-200",
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={u.username ? `/u/${u.username}` : `/u/${u.id}`}
                      className="truncate font-semibold text-slate-900 hover:text-emerald-700 hover:underline"
                    >
                      {u.display_name}
                    </Link>
                    <span className="text-xs text-slate-500">@{u.username ?? "—"}</span>
                    {u.role === "owner" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                        OWNER
                      </span>
                    )}
                    {u.role === "admin" && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        ADMIN
                      </span>
                    )}
                    {u.role === "moderator" && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                        MODERATOR
                      </span>
                    )}
                    {u.is_test && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        TEST ACCOUNT
                      </span>
                    )}
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", badge.cls)}>
                      {badge.label}
                    </span>
                    {u.appeal_status === "pending" && (
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                        APPEAL PENDING
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Joined {new Date(u.created_at).toLocaleDateString()}
                    {u.ban_scope && badge.label !== "Active" && (
                      <>
                        {" "}
                        · Restricted from <strong>{u.ban_scope}</strong>
                        {u.ban_until ? ` until ${new Date(u.ban_until).toLocaleString()}` : " permanently"}
                      </>
                    )}
                    {u.ban_scope && badge.label !== "Active" && u.ban_reason && (
                      <> · Reason: {u.ban_reason}</>
                    )}
                  </p>
                  {u.appeal_status === "pending" && u.appeal_text && (
                    <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                      <p className="font-semibold">Appeal (their one chance):</p>
                      <p className="mt-1 whitespace-pre-wrap">{u.appeal_text}</p>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {viewerId !== u.id && (
                    <RoleControls
                      user={u}
                      onDone={load}
                      onMessage={setMessage}
                      onAsk={setPending}
                    />
                  )}
                  {badge.label !== "Active" ? (
                    <>
                      {(u.role !== "admin" || viewerRole === "owner") && (
                        <button
                          onClick={() => askUnban(u)}
                          className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                        >
                          Lift restriction
                        </button>
                      )}
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Manage
                      </Link>
                    </>
                  ) : (
                    u.role !== "owner" &&
                    !(u.role === "admin" && viewerRole !== "owner") && (
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Ban / Timeout
                      </Link>
                    )
                  )}
                  {(u.role === "owner" ||
                    (u.role === "admin" && viewerRole !== "owner")) &&
                    badge.label === "Active" && (
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Manage
                    </Link>
                  )}
                  {u.appeal_status === "pending" && (
                    <button
                      onClick={() =>
                        setPending({
                          title: "Deny this appeal?",
                          body: (
                            <>
                              Deny <strong>{u.display_name}</strong>&apos;s appeal? The restriction{" "}
                              <strong>stays</strong> and they <strong>cannot appeal again</strong>.
                            </>
                          ),
                          confirmLabel: "Deny appeal",
                          danger: true,
                          onConfirm: async () => {
                            const res = await fetch("/api/admin/users", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: u.id, action: "deny_appeal" }),
                            });
                            const data = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              setMessage(data.message ?? "Failed to deny appeal.");
                              return;
                            }
                            setMessage(`Appeal denied for ${u.display_name}.`);
                            await load();
                          },
                        })
                      }
                      className="rounded-xl border border-amber-300 px-3.5 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                    >
                      Deny appeal
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">
            No members match this view.
          </div>
        )}
      </div>

      <ConfirmModal action={pending} onDone={() => setPending(null)} />
    </main>
  );
}

/**
 * Per-row role + test-flag controls. Admin-only (this page only loads for
 * admins); the database re-verifies and blocks changing your own role.
 * Confirmations go through the shared in-app modal via onAsk.
 */
function RoleControls({
  user,
  onDone,
  onMessage,
  onAsk,
}: {
  user: AdminUser;
  onDone: () => Promise<void>;
  onMessage: (m: string) => void;
  onAsk: (a: PendingConfirm) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function post(body: Record<string, unknown>, okMessage: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onMessage(data.message ?? "Action failed.");
        return;
      }
      onMessage(okMessage);
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  function askRole(role: "user" | "moderator" | "admin") {
    onAsk({
      title: "Change this role?",
      body:
        role === "admin" ? (
          <>
            Give <strong>{user.display_name}</strong> full admin powers? Admins can ban users,
            change roles, and manage everything.
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
      onConfirm: () => post({ action: "set_role", role }, `${user.display_name} is now ${role}.`),
    });
  }

  return (
    <div className="flex items-center gap-2">
      {user.role === "owner" ? (
        <span
          className="text-[11px] font-semibold text-amber-700"
          title="Assigned directly in the database — cannot be changed from the app"
        >
          assigned in DB
        </span>
      ) : (
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="sr-only">Role</span>
          <select
            value={user.role}
            disabled={busy}
            onChange={(e) => {
              const role = e.target.value as "user" | "moderator" | "admin";
              if (role === user.role) return;
              askRole(role);
              // Revert the visual selection until the change is confirmed
              // and the list reloads with fresh data.
              e.target.value = user.role;
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
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
          void post(
            { action: "set_test", is_test: !user.is_test },
            user.is_test
              ? `${user.display_name} unmarked as test account.`
              : `${user.display_name} marked as an official test account.`,
          )
        }
        className={cn(
          "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60",
          user.is_test
            ? "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            : "border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100",
        )}
        title="A marker so you always know which accounts you own — no permissions attached"
      >
        {user.is_test ? "Unmark test" : "Mark as test"}
      </button>
    </div>
  );
}
