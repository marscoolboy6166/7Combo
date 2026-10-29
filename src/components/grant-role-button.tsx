"use client";

import { useState } from "react";
import { ROLE_PRIVILEGES_BY_ROLE } from "@/lib/utils";
import ConfirmModal, { type PendingConfirm } from "@/components/confirm-modal";

type AssignableRole = "user" | "moderator" | "admin";

/**
 * Owner-only role control. Role changes are the one power admins never get,
 * so every caller renders this only when the viewer is the site owner (the
 * API and the DB both refuse anyone else).
 */
interface GrantRoleButtonProps {
  userId: string;
  targetDisplayName: string;
  /** The target's current role, so we only offer the other ones. */
  targetRole: "user" | "moderator" | "admin" | "owner";
  onDone: () => Promise<void> | void;
  onMessage: (m: string) => void;
}

const ROLE_OPTIONS: Record<
  AssignableRole,
  { title: string; confirm: string; body: string; style: string }
> = {
  moderator: {
    title: "Make @moderator",
    confirm: "Make moderator",
    body: " Moderators can post and edit combos and products, and manage their upload count.",
    style:
      "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60",
  },
  admin: {
    title: "Make @admin",
    confirm: "Make admin",
    body: " Admins get moderator powers plus ban/timeout, appeals, and test flags.",
    style:
      "rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60",
  },
  user: {
    title: "Back to member",
    confirm: "Remove staff role",
    body: " They lose every staff power and go back to a normal member account.",
    style:
      "rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60",
  },
};

export default function GrantRoleButton({
  userId,
  targetDisplayName,
  targetRole,
  onDone,
  onMessage,
}: GrantRoleButtonProps) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  // Owner targets are never offered here (the page hides the control), and
  // the role they already have is not offered either.
  const offered = (["moderator", "admin", "user"] as const).filter((r) => r !== targetRole);

  function open(roleToGrant: AssignableRole) {
    const option = ROLE_OPTIONS[roleToGrant];
    setPending({
      title:
        roleToGrant === "user" ? `Remove ${targetDisplayName}'s staff role?` : `Grant ${roleToGrant} role`,
      body: (
        <>
          {targetDisplayName} would become <strong>@{roleToGrant === "user" ? "member" : roleToGrant}</strong>.
          {option.body}
        </>
      ),
      confirmLabel: option.confirm,
      danger: roleToGrant === "admin",
      // The modal keeps itself open and shows “Working…” until this resolves,
      // then calls onDone() to close and clear our state.
      onConfirm: async () => {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: userId, action: "grant_role", role: roleToGrant }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          onMessage(data.message ?? "Action failed.");
          return;
        }
        onMessage(
          roleToGrant === "user"
            ? `${targetDisplayName} is back to a normal member account.`
            : `${targetDisplayName} is now ${roleToGrant}. ${
                roleToGrant === "admin"
                  ? ROLE_PRIVILEGES_BY_ROLE.admin
                  : ROLE_PRIVILEGES_BY_ROLE.moderator
              }`,
        );
        await onDone();
      },
    });
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      {offered.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => open(r)}
          disabled={pending !== null}
          className={ROLE_OPTIONS[r].style}
          title={r === "admin" ? "Only grant admin to people you fully trust" : undefined}
        >
          {ROLE_OPTIONS[r].title}
        </button>
      ))}
      <ConfirmModal action={pending} onDone={() => setPending(null)} />
    </div>
  );
}
