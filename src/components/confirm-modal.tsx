"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface PendingConfirm {
  title: string;
  /** Body text — can include styled spans/strong tags. */
  body: React.ReactNode;
  confirmLabel: string;
  /** Red confirm button for destructive actions (default: emerald). */
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  /** Called only when the user dismisses without confirming. */
  onCancel?: () => void;
}

/**
 * In-app confirmation dialog — the popup replacement for window.confirm.
 * Parent keeps a `PendingConfirm | null` state; onDone clears it. While
 * the action runs the modal shows a busy state and can't be dismissed;
 * on completion it closes (errors are surfaced by the caller's own
 * message state).
 */
export default function ConfirmModal({
  action,
  onDone,
}: {
  action: PendingConfirm | null;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  // Escape closes (unless busy).
  useEffect(() => {
    if (!action || busy) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        action?.onCancel?.();
        onDone();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, busy]);

  if (!action) return null;

  async function confirm() {
    setBusy(true);
    try {
      await action!.onConfirm();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    if (busy) return;
    action?.onCancel?.();
    onDone();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={action.title}
      onClick={dismiss}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-900">{action.title}</h3>
        <div className="mt-2 text-sm text-slate-600">{action.body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60",
              action.danger ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700",
            )}
          >
            {busy ? "Working…" : action.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
