"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Stars from "@/components/stars";
import { cn } from "@/lib/utils";

interface AdminComboProduct {
  slug: string;
  name_en: string;
  emoji: string | null;
}

interface AdminCombo {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  steps: string | null;
  photo_url: string | null;
  author_name: string | null;
  avg_rating: number;
  rating_count: number;
  created_at: string;
  archived: boolean | null;
  profiles?: { display_name: string | null; username: string | null } | null;
  combo_items?: Array<{ products: AdminComboProduct | null }>;
}

type Filter = "all" | "live" | "archived";

const MIGRATION_SQL = `alter table public.combos add column if not exists archived boolean not null default false;
create index if not exists combos_archived_idx on public.combos (archived);

drop policy if exists "Public read combos" on public.combos;
create policy "Public read combos"
  on public.combos for select
  using (archived = false or public.is_admin());

drop policy if exists "Admins update any combos" on public.combos;
create policy "Admins update any combos"
  on public.combos for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins delete any combos" on public.combos;
create policy "Admins delete any combos"
  on public.combos for delete
  using (public.is_admin());

revoke update on public.combos from anon, authenticated;
grant update (title, description, steps, photo_url, archived) on public.combos to authenticated;`;

export default function AdminCombosPage() {
  const [combos, setCombos] = useState<AdminCombo[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "needs-migration" | "error">(
    "loading",
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    id: string;
    title: string;
    description: string;
    steps: string;
  } | null>(null);
  const [confirming, setConfirming] = useState<AdminCombo | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/combos");
    if (res.status === 409) {
      setStatus("needs-migration");
      return;
    }
    if (!res.ok) {
      setErrorText((await res.json().catch(() => ({}))).message ?? "Failed to load combos.");
      setStatus("error");
      return;
    }
    const data = await res.json();
    setCombos(data.combos ?? []);
    setStatus("ready");
  }, []);

  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = [...combos];
    if (filter === "live") list = list.filter((c) => !c.archived);
    if (filter === "archived") list = list.filter((c) => c.archived);
    const needle = query.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (c) =>
          c.title.toLowerCase().includes(needle) ||
          (c.author_name ?? "").toLowerCase().includes(needle) ||
          (c.profiles?.display_name ?? "").toLowerCase().includes(needle) ||
          (c.profiles?.username ?? "").toLowerCase().includes(needle) ||
          c.slug.toLowerCase().includes(needle) ||
          (c.combo_items ?? []).some((i) =>
            (i.products?.name_en ?? "").toLowerCase().includes(needle),
          ),
      );
    }
    return list;
  }, [combos, filter, query]);

  const liveCount = combos.filter((c) => !c.archived).length;
  const archivedCount = combos.length - liveCount;

  async function act(
    combo: AdminCombo,
    action: "archive" | "unarchive" | "delete",
  ) {
    setBusyId(combo.id);
    setMessage(null);
    try {
      const res =
        action === "delete"
          ? await fetch(`/api/admin/combos?id=${combo.id}`, { method: "DELETE" })
          : await fetch("/api/admin/combos", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: combo.id, action }),
            });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message ?? "Action failed.");
        return;
      }
      setMessage(
        action === "delete"
          ? "Combo deleted permanently."
          : action === "archive"
            ? "Combo archived — hidden from the public site."
            : "Combo restored to the public site.",
      );
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusyId(editing.id);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/combos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          action: "edit",
          title: editing.title,
          description: editing.description,
          steps: editing.steps,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.message ?? "Save failed.");
        return;
      }
      setMessage("Combo updated ✓");
      setEditing(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (status === "loading") {
    return <p className="py-10 text-center text-sm text-slate-500">Loading combos…</p>;
  }

  if (status === "needs-migration") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <h2 className="text-lg font-bold">One quick step: run the moderation SQL</h2>
        <p className="mt-2">
          The <code>archived</code> column doesn&apos;t exist yet, so combo moderation is disabled.
          Paste this into <strong>Supabase → SQL Editor → Run</strong> (it&apos;s already saved in{" "}
          <code>supabase/schema.sql</code> too), then reload this page:
        </p>
        <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-white p-4 text-xs leading-relaxed text-slate-700">
          {MIGRATION_SQL}
        </pre>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        <h2 className="text-lg font-bold">Couldn&apos;t load combos</h2>
        <p className="mt-2">{errorText}</p>
        <button
          onClick={load}
          className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <main>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold tracking-tight">Combos</h2>
        <span className="text-sm text-slate-500">
          {liveCount} live · {archivedCount} archived
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, author, ingredient…"
            className="w-56 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          {(
            [
              ["all", `All (${combos.length})`],
              ["live", `Live (${liveCount})`],
              ["archived", `Archived (${archivedCount})`],
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
        <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {message}
        </p>
      )}

      <div className="mt-4 space-y-3">
        {filtered.map((combo) => {
          const authorName =
            combo.profiles?.display_name ?? combo.author_name ?? "A snacker";
          const busy = busyId === combo.id;

          if (editing?.id === combo.id) {
            return (
              <form
                key={combo.id}
                onSubmit={saveEdit}
                className="rounded-2xl border border-emerald-300 bg-emerald-50/40 p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Editing combo
                </p>
                <label className="mt-2 block text-sm font-medium text-slate-600">
                  Title
                  <input
                    required
                    minLength={3}
                    maxLength={120}
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="mt-2 block text-sm font-medium text-slate-600">
                  Description
                  <textarea
                    rows={2}
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="mt-2 block text-sm font-medium text-slate-600">
                  Steps (one per line)
                  <textarea
                    rows={4}
                    value={editing.steps}
                    onChange={(e) => setEditing({ ...editing, steps: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            );
          }

          return (
            <div
              key={combo.id}
              className={cn(
                "rounded-2xl border bg-white p-4 shadow-sm",
                combo.archived ? "border-amber-300 bg-amber-50/40" : "border-slate-200",
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/combos/${combo.slug}`}
                      className="truncate font-semibold text-slate-900 hover:text-emerald-700 hover:underline"
                    >
                      {combo.title}
                    </Link>
                    {combo.archived && (
                      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                        archived — hidden from public
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <Stars value={combo.avg_rating} count={combo.rating_count} />
                    <span>·</span>
                    <span>by {authorName}</span>
                    <span>·</span>
                    <span>{new Date(combo.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(combo.combo_items ?? []).slice(0, 8).map((item, idx) => (
                      <span
                        key={`${combo.id}-${item.products?.slug ?? idx}`}
                        title={item.products?.name_en ?? ""}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs"
                      >
                        {item.products?.emoji ?? "🛒"} {item.products?.name_en ?? "?"}
                      </span>
                    ))}
                    {(combo.combo_items?.length ?? 0) > 8 && (
                      <span className="text-xs text-slate-400">
                        +{(combo.combo_items?.length ?? 0) - 8} more
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {combo.archived ? (
                    <button
                      onClick={() => act(combo, "unarchive")}
                      disabled={busy}
                      className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      Unarchive
                    </button>
                  ) : (
                    <button
                      onClick={() => act(combo, "archive")}
                      disabled={busy}
                      className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
                    >
                      Archive
                    </button>
                  )}
                  <button
                    onClick={() =>
                      setEditing({
                        id: combo.id,
                        title: combo.title,
                        description: combo.description ?? "",
                        steps: combo.steps ?? "",
                      })
                    }
                    disabled={busy}
                    className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setConfirming(combo)}
                    disabled={busy}
                    className="rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">
            {combos.length === 0
              ? "No combos yet — they'll appear here as users post them."
              : "No combos match this search / filter."}
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        combo={confirming}
        busy={confirming !== null && busyId === confirming.id}
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          if (confirming) {
            await act(confirming, "delete");
            setConfirming(null);
          }
        }}
      />
    </main>
  );
}

function ConfirmDeleteModal({
  combo,
  busy,
  onCancel,
  onConfirm,
}: {
  combo: AdminCombo | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!combo) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm deletion"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-900">Delete this combo?</h3>
        <p className="mt-2 text-sm text-slate-600">
          You are about to permanently delete{" "}
          <span className="font-semibold text-slate-900">“{combo.title}”</span>.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Its ingredients and all ratings are removed with it. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Keep combo
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Yes, delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}
