"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmModal, { type PendingConfirm } from "@/components/confirm-modal";

/**
 * Overlay delete button for the author's own combo cards (profile
 * grid). Positioned over the card — the card itself stays a link,
 * so the button lives beside it, not inside it. Deletion is
 * re-verified server-side; RLS is the second lock.
 */
export default function ComboDeleteBadge({
  comboId,
  comboTitle,
}: {
  comboId: string;
  comboTitle: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    setError(null);
    try {
      const res = await fetch(`/api/combos/${comboId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Could not delete the combo.");
        return;
      }
      // Server component re-renders without the deleted combo.
      router.refresh();
    } catch {
      setError("Could not delete the combo.");
    }
  }

  return (
    <>
      <button
        onClick={() =>
          setPending({
            title: "Delete this combo?",
            body: (
              <>
                <strong>{comboTitle}</strong> will be permanently removed —
                along with its ratings and comments. This can&apos;t be undone.
              </>
            ),
            confirmLabel: "Delete combo",
            danger: true,
            onConfirm: doDelete,
          })
        }
        aria-label={`Delete ${comboTitle}`}
        title="Delete this combo"
        className="absolute right-2 top-2 z-10 rounded-full border border-red-200 bg-white/95 p-1.5 text-red-600 opacity-0 shadow-sm transition hover:bg-red-50 focus:opacity-100 group-hover:opacity-100"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
        >
          <path d="M3 6h18" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
      {error && (
        <span className="absolute inset-x-2 top-14 z-10 rounded-lg bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700">
          {error}
        </span>
      )}
      <ConfirmModal action={pending} onDone={() => setPending(null)} />
    </>
  );
}
