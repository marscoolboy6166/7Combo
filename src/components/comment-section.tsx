"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import FilterAppealBox from "@/components/filter-appeal-box";

interface Comment {
  id: string;
  combo_id: string;
  author_id: string;
  body: string;
  hidden: boolean;
  created_at: string;
  profiles: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
    is_test: boolean | null;
  } | null;
}

interface ListResponse {
  comments?: Comment[];
  signedIn?: boolean;
  viewerId?: string | null;
  role?: string | null;
  message?: string;
}

function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="h-8 w-8 rounded-full object-cover" />
    );
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/**
 * Comment section for a combo: list, post form, and staff moderation
 * (hide / unhide / delete). Ban and burst-limit enforcement live in the
 * database; the API surfaces them as friendly messages here.
 */
export default function CommentSection({ comboId }: { comboId: string }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterFlag, setFilterFlag] = useState<{
    flaggedText: string;
    rule: string | null;
  } | null>(null);
  const ran = useRef(false);

  const isStaff = role === "owner" || role === "admin" || role === "moderator";

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/combos/${comboId}/comments`);
      const data: ListResponse = await res.json();
      setComments(data.comments ?? []);
      setSignedIn(Boolean(data.signedIn));
      setViewerId(data.viewerId ?? null);
      setRole(data.role ?? null);
    } catch {
      setComments([]);
    }
  }, [comboId]);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    setFilterFlag(null);
    try {
      const res = await fetch(`/api/combos/${comboId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Could not post your comment.");
        if (data.filterFlag) setFilterFlag(data.filterFlag);
        return;
      }
      setText("");
      setNotice("Comment posted.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function moderate(comment: Comment, action: "hide" | "unhide" | "delete") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res =
        action === "delete"
          ? await fetch(`/api/admin/comments?id=${comment.id}`, { method: "DELETE" })
          : await fetch("/api/admin/comments", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: comment.id, action }),
            });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message ?? "Moderation action failed.");
        return;
      }
      setNotice(
        action === "delete"
          ? "Comment deleted."
          : action === "hide"
            ? "Comment hidden from the public."
            : "Comment restored.",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  const list = comments ?? [];

  return (
    <section className="mt-10" aria-label="Comments">
      <h2 className="text-lg font-bold tracking-tight">
        Comments{" "}
        {comments !== null && (
          <span className="text-sm font-normal text-slate-400">({list.length})</span>
        )}
      </h2>

      {/* ---- post form ---- */}
      {signedIn ? (
        <>
        <form onSubmit={submit} className="mt-3">
          <textarea
            rows={2}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Share your thoughts on this combo…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || text.trim().length === 0}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy ? "Posting…" : "Post comment"}
            </button>
            {notice && <span className="text-xs font-medium text-emerald-700">{notice}</span>}
            {error && <span className="text-xs font-medium text-red-700">{error}</span>}
          </div>
        </form>
        {filterFlag && (
          <FilterAppealBox
            kind="comment"
            flaggedText={filterFlag.flaggedText}
            filterReason={error ?? "Filtered"}
            context={{ combo_id: comboId }}
          />
        )}
        </>
      ) : (
        <p className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
          <Link href="/login" className="font-semibold text-emerald-700 hover:underline">
            Sign in
          </Link>{" "}
          to join the conversation.
        </p>
      )}

      {/* ---- list ---- */}
      {comments === null ? (
        <p className="mt-4 text-sm text-slate-400">Loading comments…</p>
      ) : list.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No comments yet — be the first to share how this combo went.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {list.map((c) => {
            const author = c.profiles?.display_name ?? "A snacker";
            const mine = viewerId === c.author_id;
            return (
              <li
                key={c.id}
                className={cn(
                  "rounded-2xl border bg-white p-4 shadow-sm",
                  c.hidden ? "border-amber-300 bg-amber-50/50" : "border-slate-200",
                )}
              >
                <div className="flex items-center gap-2">
                  <Avatar url={c.profiles?.avatar_url ?? null} name={author} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm">
                      {c.profiles?.username ? (
                        <Link
                          href={`/u/${c.profiles.username}`}
                          className="font-semibold text-slate-800 hover:text-emerald-700 hover:underline"
                        >
                          {author}
                        </Link>
                      ) : (
                        <span className="font-semibold text-slate-800">{author}</span>
                      )}
                      {c.profiles?.is_test && (
                        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                          test
                        </span>
                      )}
                      {mine && (
                        <span className="text-xs text-slate-400">(you)</span>
                      )}
                      <span className="text-xs text-slate-400">· {timeAgo(c.created_at)}</span>
                    </p>
                  </div>
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {c.body}
                </p>

                {c.hidden && (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
                    hidden by staff — only staff can see this
                  </p>
                )}

                {(isStaff || mine) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                    {isStaff &&
                      (c.hidden ? (
                        <button
                          onClick={() => moderate(c, "unhide")}
                          disabled={busy}
                          className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                        >
                          Unhide
                        </button>
                      ) : (
                        <button
                          onClick={() => moderate(c, "hide")}
                          disabled={busy}
                          className="rounded-lg border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
                        >
                          Hide
                        </button>
                      ))}
                    {(isStaff || mine) && (
                      <button
                        onClick={() => moderate(c, "delete")}
                        disabled={busy}
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
