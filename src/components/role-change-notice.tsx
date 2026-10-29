"use client";

import { useEffect, useState } from "react";
import { ROLE_PRIVILEGES_BY_ROLE } from "@/lib/utils";

type StaffRole = "moderator" | "admin";

const STORAGE_KEY = "7combo:role-change-seen";

/**
 * Root-layout popup: shown once after the owner (or an admin) grants the
 * current viewer a staff role. The layout passes the viewer's most recent
 * role change from `my_recent_role_changes()`; the timestamp is remembered
 * in localStorage so a reload does not show it again.
 */
export default function RoleChangeNotice({
  recentChange,
}: {
  recentChange: { event_type: string; p_role: string; changed_at: string } | null;
}) {
  const [seen, setSeen] = useState(false);

  const isStaffRole = recentChange?.p_role === "moderator" || recentChange?.p_role === "admin";
  const show = Boolean(recentChange && recentChange.event_type === "role_change" && isStaffRole);

  const changedAt = recentChange?.changed_at ?? null;

  // Read the “already seen” marker after mount (localStorage is client-only).
  useEffect(() => {
    if (!changedAt) return;
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive) return;
      try {
        setSeen(window.localStorage.getItem(STORAGE_KEY) === changedAt);
      } catch {
        // Storage can be blocked (private mode) — showing the notice again is fine.
      }
    });
    return () => {
      alive = false;
    };
  }, [changedAt]);

  function remember() {
    if (!changedAt) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, changedAt);
    } catch {
      // Ignore: the notice just may show again next load.
    }
  }

  useEffect(() => {
    if (!show || seen || !changedAt) return;
    const marker = changedAt;
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, marker);
      } catch {
        // Ignore: the notice just may show again next load.
      }
      setSeen(true);
    }, 60000);
    return () => clearTimeout(timer);
  }, [show, seen, changedAt]);

  if (!show || seen) return null;

  const role = recentChange?.p_role as StaffRole;
  const privileges = ROLE_PRIVILEGES_BY_ROLE[role];

  return (
    <div
      className="fixed left-1/2 top-4 z-50 w-[calc(100%-3rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-lg"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-emerald-600">
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-800">
            Your role was updated — you are now an {role}.
          </p>
          <p className="mt-1 text-xs text-emerald-700">{privileges}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            remember();
            setSeen(true);
          }}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
