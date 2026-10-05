"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmModal, { type PendingConfirm } from "@/components/confirm-modal";

/**
 * Rendered only when the viewer is the combo's author. Offers a
 * permanent delete with confirmation; the API re-verifies ownership
 * server-side (RLS is the second lock). On success the user is
 * sent back to the combo list — the page itself is gone.
 */
export default function ComboOwnerActions({
  comboId,
  comboTitle,
}: {
  comboId: string;
  comboTitle: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  async function doDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/combos/${comboId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Could not delete the combo.");
        return;
      }
      router.push("/combos");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
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
        disabled={busy}
        className="rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
      >
        {busy ? "Deleting…" : "Delete combo"}
      </button>
      {error && (
        <span className="text-xs font-medium text-red-700">{error}</span>
      )}
      <ConfirmModal action={pending} onDone={() => setPending(null)} />
    </div>
  );
}
