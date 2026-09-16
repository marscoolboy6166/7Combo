"use client";

import { useRef, useState } from "react";

/**
 * Image picker for one product: uploads a file to /api/admin/products/image.
 * Falls back gracefully with a message if the storage policy is missing.
 *
 * Two render modes:
 *  - default: 64px thumbnail + labeled Upload/Replace and Remove buttons
 *  - compact: 56px card-corner thumbnail with the product emoji as
 *    placeholder, a 📷 overlay to upload and an ✕ to remove
 */
export default function ProductImageUploader({
  slug,
  currentImage,
  onChanged,
  compact = false,
  emoji = null,
}: {
  slug: string;
  currentImage: string | null;
  onChanged: () => void;
  compact?: boolean;
  emoji?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("slug", slug);
      body.append("file", file);
      const res = await fetch("/api/admin/products/image", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message ?? "Upload failed.");
        return;
      }
      setMessage("Image saved ✓");
      onChanged();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeImage() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/products/image?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message ?? "Could not remove image.");
        return;
      }
      setMessage("Image removed ✓");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <div
        className="relative shrink-0"
        title={currentImage ? "Replace image" : "Upload image (JPG/PNG/WebP/GIF, ≤4 MB)"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="group relative h-14 w-14">
          {currentImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentImage}
              alt=""
              className="h-14 w-14 rounded-xl border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-2xl">
              {emoji || "🛒"}
            </div>
          )}
          {/* Upload / replace overlay */}
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/55 text-sm text-white opacity-0 transition hover:opacity-100 focus:opacity-100 disabled:opacity-60"
            aria-label={currentImage ? "Replace image" : "Upload image"}
          >
            {busy ? "…" : "📷"}
          </button>
          {currentImage && (
            <button
              type="button"
              disabled={busy}
              onClick={removeImage}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-bold text-slate-500 shadow-sm transition hover:text-red-600 disabled:opacity-60"
              aria-label="Remove image"
              title="Remove image"
            >
              ✕
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        {message && (
          <span
            className={`absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full ${
              message.includes("✓") ? "bg-emerald-500" : "bg-red-500"
            }`}
            title={message}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      {currentImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentImage}
          alt=""
          className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 object-cover"
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xl text-slate-300">
          🖼️
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {busy ? "Working…" : currentImage ? "Replace image" : "Upload image"}
          </button>
          {currentImage && (
            <button
              type="button"
              disabled={busy}
              onClick={removeImage}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400">JPG / PNG / WebP / GIF, up to 4 MB.</p>
        {message && (
          <p className={message.includes("✓") ? "text-xs text-emerald-700" : "text-xs text-red-600"}>
            {message}
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </div>
    </div>
  );
}
