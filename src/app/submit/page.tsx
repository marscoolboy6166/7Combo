"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/config";
import { baht, cn } from "@/lib/utils";
import type { Product } from "@/lib/types";
import BannedNotice from "@/components/banned-notice";

interface PickerProduct extends Product {
  demo?: boolean;
}

interface SelectedItem {
  product_id: string;
  quantity: number;
  notes: string;
  product: PickerProduct;
}

export default function SubmitPage() {
  const router = useRouter();
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [demo, setDemo] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SelectedItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [banState, setBanState] = useState<{
    banned: boolean;
    scope: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products ?? []);
        setDemo(Boolean(data.demo));
      })
      .catch(() => setError("Could not load the product list."));

    const supabase = isSupabaseConfigured() ? createClient() : null;
    (supabase
      ? supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)))
      : Promise.resolve()
    ).finally(() => setSignedIn((s) => (s === null ? false : s)));

    // Posting-scope bans replace the form with a notice + appeal form.
    fetch("/api/me/ban")
      .then((r) => r.json())
      .then((b) => setBanState({ banned: Boolean(b.banned), scope: b.scope ?? null }))
      .catch(() => setBanState(null));
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const chosen = new Set(selected.map((s) => s.product_id));
    return products
      .filter((p) => !chosen.has(p.id))
      .filter(
        (p) =>
          !needle ||
          p.name_en.toLowerCase().includes(needle) ||
          (p.name_th ?? "").includes(search.trim()),
      )
      .slice(0, 8);
  }, [products, search, selected]);

  const total = selected.reduce(
    (sum, s) => sum + Number(s.product.price_thb) * s.quantity,
    0,
  );

  function addProduct(p: PickerProduct) {
    setSelected((prev) =>
      prev.some((s) => s.product_id === p.id)
        ? prev
        : [...prev, { product_id: p.id, quantity: 1, notes: "", product: p }],
    );
    setSearch("");
  }

  function updateItem(id: string, patch: Partial<SelectedItem>) {
    setSelected((prev) => prev.map((s) => (s.product_id === id ? { ...s, ...patch } : s)));
  }

  function removeItem(id: string) {
    setSelected((prev) => prev.filter((s) => s.product_id !== id));
  }

  async function uploadPhoto(): Promise<string | null> {
    if (!photoFile) return null;
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const ext = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${userData.user!.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("combo-photos")
      .upload(path, photoFile, { contentType: photoFile.type });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
    const { data } = supabase.storage.from("combo-photos").getPublicUrl(path);
    return data.publicUrl;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (!isSupabaseConfigured()) {
        setError(NOT_CONFIGURED_MESSAGE);
        return;
      }
      const photo_url = await uploadPhoto();
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, steps, photo_url, items: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Could not post your combo.");
        return;
      }
      router.push(`/combos/${data.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  if (signedIn === false) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <span className="text-5xl">🔒</span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Sign in to post a combo</h1>
          <p className="mt-2 text-sm text-slate-500">
            Posting requires an account so ratings stay fair and spam stays low.
          </p>
          <Link
            href="/login?next=/submit"
            className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Continue with Google
          </Link>
        </div>
      </main>
    );
  }

  // Banned from posting → notice instead of the form.
  if (banState?.banned && (banState.scope === "posting" || banState.scope === "both")) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Post a combo</h1>
        <div className="mt-6">
          <BannedNotice />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Post a combo</h1>
      <p className="mt-1 text-sm text-slate-500">
        Mix real 7-Eleven products into something greater than the sum of its parts.
      </p>

      {demo && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Demo mode: you can explore the form, but posting needs Supabase connected (see README.md).
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-6">
        {/* Ingredients */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">1 · Ingredients</h2>

          {selected.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {selected.map((s) => (
                <li
                  key={s.product_id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <span className="text-xl">{s.product.emoji}</span>
                  <span className="text-sm font-medium text-slate-800">{s.product.name_en}</span>
                  <span className="text-xs text-slate-400">{baht(Number(s.product.price_thb))}</span>
                  <label className="ml-auto flex items-center gap-1 text-xs text-slate-500">
                    ×
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={s.quantity}
                      onChange={(e) =>
                        updateItem(s.product_id, { quantity: Number(e.target.value) || 1 })
                      }
                      className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                  </label>
                  <input
                    type="text"
                    value={s.notes}
                    placeholder="note (optional)"
                    onChange={(e) => updateItem(s.product_id, { notes: e.target.value })}
                    className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(s.product_id)}
                    className="rounded-lg px-2 py-1 text-sm text-red-500 hover:bg-red-50"
                    aria-label={`Remove ${s.product.name_en}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
              <li className="text-right text-sm font-semibold text-slate-700">
                Total: ~{baht(total)}
              </li>
            </ul>
          )}

          <div className="relative mt-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products to add…"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
            {search.trim() && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {filtered.length === 0 && (
                  <li className="px-4 py-3 text-sm text-slate-400">No matches</li>
                )}
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addProduct(p)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-emerald-50"
                    >
                      <span className="text-lg">{p.emoji}</span>
                      <span className="font-medium text-slate-800">{p.name_en}</span>
                      <span className="ml-auto text-slate-400">{baht(Number(p.price_thb))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Story */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">2 · The story</h2>
          <label className="mt-3 block text-sm font-medium text-slate-600">
            Title *
            <input
              type="text"
              required
              minLength={3}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Crab Stick Fish Roe Dip"
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-600">
            Why is it good?
            <textarea
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Sell it in a sentence or two…"
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-600">
            Steps (one per line)
            <textarea
              rows={5}
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              placeholder={"1. Chill everything\n2. Mix the sauce\n3. Dip"}
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </label>
        </section>

        {/* Photo */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">3 · Photo (optional)</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            className="mt-3 block w-full text-sm text-slate-500 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-700 hover:file:bg-emerald-100"
          />
          <p className="mt-1 text-xs text-slate-400">PNG, JPEG or WebP, up to 5 MB.</p>
        </section>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving || selected.length === 0 || title.trim().length < 3}
          className={cn(
            "rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition",
            saving || selected.length === 0 || title.trim().length < 3
              ? "cursor-not-allowed bg-slate-300"
              : "bg-emerald-600 hover:bg-emerald-700",
          )}
        >
          {saving ? "Posting…" : "Post combo"}
        </button>
      </form>
    </main>
  );
}
