"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CATEGORIES, CITIES, categoryLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import ProductImageUploader from "@/components/product-image-uploader";
import BulkCatalogPanel from "@/components/bulk-catalog-panel";

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
  const [state, setState] = useState<"loading" | "forbidden" | "ready" | "no-supabase">("loading");
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [sortBy, setSortBy] = useState("name");

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
    const health = await fetch("/api/health").then((r) => r.json());
    if (!health.supabaseConfigured) {
      setState("no-supabase");
      return;
    }
    const res = await fetch("/api/admin/products");
    if (res.status === 403 || res.status === 401) {
      setState("forbidden");
      return;
    }
    const data = await res.json();
    setProducts(data.products ?? []);
    setState("ready");
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
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      setMessage(editingSlug ? "Product updated ✓" : "Product added ✓");
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

  if (state === "loading") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-slate-500">
        Checking access…
      </main>
    );
  }

  if (state === "no-supabase") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-sm text-amber-800">
          <p className="text-3xl">🛠️</p>
          <h1 className="mt-2 text-lg font-bold">Supabase is not connected yet</h1>
          <p className="mt-2">
            The admin panel needs the database. Follow the setup steps in <code>README.md</code>,
            then reload this page.
          </p>
        </div>
      </main>
    );
  }

  if (state === "forbidden") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <span className="text-5xl">🔐</span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Admins only</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in with an account that has the <code>is_admin</code> flag set in the{" "}
            <code>profiles</code> table.
          </p>
          <Link
            href="/login?next=/admin"
            className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Sign in
          </Link>
          <p className="mt-4 text-xs text-slate-400">
            Admin access is granted by the site owner via the database.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Product admin</h1>
      <p className="mt-1 text-sm text-slate-500">
        Maintain the 7-Eleven catalog: names, prices, categories, and which cities stock each item.
      </p>

      {/* Form */}
      <form
        onSubmit={save}
        className="mt-6 grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2"
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
                {c.emoji} {c.label}
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
        </label>

        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : editingSlug ? "Save changes" : "Add product"}
          </button>
          {editingSlug && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          {message && <span className="text-sm text-emerald-700">{message}</span>}
        </div>
      </form>

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
                  {c.emoji} {c.label}
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
              className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-emerald-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <ProductImageUploader
                slug={p.slug}
                currentImage={p.image_url}
                emoji={p.emoji}
                compact
                onChanged={load}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold text-slate-800">{p.name_en}</p>
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      p.is_active ? "bg-emerald-500" : "bg-slate-300",
                    )}
                    title={p.is_active ? "Active — visible in catalog" : "Hidden — not in catalog"}
                  />
                </div>
                {p.name_th && <p className="truncate text-xs text-slate-400">{p.name_th}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                    {categoryLabel(p.category)}
                  </span>
                  <span className="text-sm font-bold text-slate-700">฿{p.price_thb}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-slate-400">
                  {p.cities.includes("all") ? "Nationwide" : p.cities.join(", ")}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit(p);
                }}
                className="shrink-0 self-end rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                Edit
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">
              {products.length === 0
                ? "No products yet — add your first one above, or run supabase/seed.sql."
                : "No products match this search / filter."}
            </div>
          )}
        </div>
      </section>

      {/* Bulk import / export */}
      <BulkCatalogPanel onImported={load} />
    </main>
  );
}
