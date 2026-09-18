"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, CITIES, categoryLabel, cityLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import ProductImageUploader from "@/components/product-image-uploader";
import BulkCatalogPanel from "@/components/bulk-catalog-panel";

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2.5 py-1 text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface AdminProduct {
  id: string;
  slug: string;
  name_en: string;
  name_th: string | null;
  category: string;
  price_thb: number;
  description: string | null;
  emoji: string | null;
  image_url: string | null;
  cities: string[];
  is_active: boolean;
}

const EMPTY_FORM = {
  slug: "",
  name_en: "",
  name_th: "",
  category: "other",
  price_thb: "",
  description: "",
  emoji: "🛒",
  cities: ["all"] as string[],
  is_active: true,
};

export default function AdminPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = [...products];
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (p) =>
          p.name_en.toLowerCase().includes(needle) ||
          (p.name_th ?? "").toLowerCase().includes(needle) ||
          p.slug.toLowerCase().includes(needle),
      );
    }
    if (filterCat) list = list.filter((p) => p.category === filterCat);
    switch (sortBy) {
      case "price-asc":
        list.sort((a, b) => Number(a.price_thb) - Number(b.price_thb));
        break;
      case "price-desc":
        list.sort((a, b) => Number(b.price_thb) - Number(a.price_thb));
        break;
      case "category":
        list.sort(
          (a, b) => a.category.localeCompare(b.category) || a.name_en.localeCompare(b.name_en),
        );
        break;
      case "active":
        list.sort(
          (a, b) =>
            Number(b.is_active) - Number(a.is_active) || a.name_en.localeCompare(b.name_en),
        );
        break;
      default:
        list.sort((a, b) => a.name_en.localeCompare(b.name_en));
    }
    return list;
  }, [products, query, filterCat, sortBy]);

  const load = useCallback(async () => {
    // The layout gate already verified admin access; this fetch 401s/403s
    // harmlessly if the session expired mid-visit.
    const res = await fetch("/api/admin/products");
    if (!res.ok) return;
    const data = await res.json();
    setProducts(data.products ?? []);
  }, []);

  const ranLoad = useRef(false);

  useEffect(() => {
    if (ranLoad.current) return;
    ranLoad.current = true;
    load();
  }, [load]);

  function startEdit(p: AdminProduct) {
    setEditingSlug(p.slug);
    setForm({
      slug: p.slug,
      name_en: p.name_en,
      name_th: p.name_th ?? "",
      category: p.category,
      price_thb: String(p.price_thb),
      description: p.description ?? "",
      emoji: p.emoji ?? "🛒",
      cities: p.cities.length ? p.cities : ["all"],
      is_active: p.is_active,
    });
    setFormOpen(true);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingSlug(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          price_thb: Number(form.price_thb) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message ?? "Save failed.");
        return;
      }
      setFormOpen(false);
      setMessage(editingSlug ? "Product updated" : "Product added");
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  function toggleCity(value: string) {
    setForm((f) => {
      const has = f.cities.includes(value);
      let cities = has ? f.cities.filter((c) => c !== value) : [...f.cities, value];
      if (value === "all" && !has) cities = ["all"];
      else if (value !== "all") cities = cities.filter((c) => c !== "all");
      if (cities.length === 0) cities = ["all"];
      return { ...f, cities };
    });
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h2 className="text-2xl font-bold tracking-tight">Products</h2>
      <p className="mt-1 text-sm text-slate-500">
        Maintain the 7-Eleven catalog: names, prices, categories, and which cities stock each item.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            resetForm();
            setFormOpen(true);
          }}
          className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          + Add product
        </button>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Import CSV
        </button>
      </div>

      {message && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{message}</p>
      )}

      {/* Add / edit product modal */}
      {formOpen && (
      <ModalShell onClose={() => setFormOpen(false)}>
      <form
        onSubmit={save}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
          {editingSlug ? `Editing: ${editingSlug}` : "Add a new product"}
        </h2>

        <label className="text-sm font-medium text-slate-600">
          Name (English) *
          <input
            required
            value={form.name_en}
            onChange={(e) => setForm({ ...form, name_en: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium text-slate-600">
          Name (Thai)
          <input
            value={form.name_th}
            onChange={(e) => setForm({ ...form, name_th: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm font-medium text-slate-600">
          Category
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-600">
          Price (THB)
          <input
            type="number"
            min={0}
            step="0.5"
            value={form.price_thb}
            onChange={(e) => setForm({ ...form, price_thb: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="text-sm font-medium text-slate-600">
          Emoji
          <input
            value={form.emoji}
            onChange={(e) => setForm({ ...form, emoji: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <fieldset className="text-sm font-medium text-slate-600">
          <legend className="mb-1">Available in</legend>
          <div className="flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => toggleCity(c.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  form.cities.includes(c.value)
                    ? "bg-emerald-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            &ldquo;Nationwide&rdquo; means stocked everywhere.
          </p>
        </fieldset>

        <label className="text-sm font-medium text-slate-600 sm:col-span-2">
          Description
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300"
          />
          Active (visible in catalog)
        </label>        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : editingSlug ? "Save changes" : "Add product"}
          </button>
          <button
            type="button"
            onClick={() => setFormOpen(false)}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
      </ModalShell>
      )}

      {/* Product table */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold tracking-tight">
            Catalog ({filtered.length}
            {filtered.length !== products.length ? ` of ${products.length}` : ""})
          </h2>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search catalog…"
              className="w-44 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none"
            >
              <option value="name">Sort: Name (A → Z)</option>
              <option value="price-asc">Sort: Price ↑</option>
              <option value="price-desc">Sort: Price ↓</option>
              <option value="category">Sort: Category</option>
              <option value="active">Sort: Active first</option>
            </select>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => startEdit(p)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  startEdit(p);
                }
              }}
              className="group flex cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-emerald-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <div className="flex justify-end">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    p.is_active ? "bg-emerald-500" : "bg-slate-300",
                  )}
                  title={p.is_active ? "Active — visible in catalog" : "Hidden — not in catalog"}
                />
              </div>

              <div className="self-start">
                <ProductImageUploader
                  slug={p.slug}
                  currentImage={p.image_url}
                  emoji={p.emoji}
                  compact
                  onChanged={load}
                />
              </div>
              <span className="mt-2 self-start rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                {categoryLabel(p.category)}
              </span>

              <p className="mt-2 font-semibold leading-snug text-slate-800">{p.name_en}</p>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit(p);
                }}
                className="mt-2 shrink-0 self-end rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                Edit
              </button>

              <div className="mt-auto pt-2 text-[11px] text-slate-500">
                <span className="text-sm font-bold text-slate-700">฿{p.price_thb}</span>
                <span className="mx-1 text-slate-300">·</span>
                {p.cities.includes("all") ? "Nationwide" : p.cities.map(cityLabel).join(", ")}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">
              {products.length === 0
                ? "No products yet — use Add product above, or run supabase/seed.sql."
                : "No products match this search / filter."}
            </div>
          )}
        </div>
      </section>

      {/* Import CSV modal */}
      {importOpen && (
        <ModalShell onClose={() => setImportOpen(false)}>
          <BulkCatalogPanel onImported={load} />
        </ModalShell>
      )}
    </main>
  );
}
