"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function RatingWidget({
  comboId,
  comboSlug,
  initialAvg,
  initialCount,
}: {
  comboId: string;
  comboSlug: string;
  initialAvg: number;
  initialCount: number;
}) {
  const [avg, setAvg] = useState(initialAvg);
  const [count, setCount] = useState(initialCount);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/combos/${comboId}/rating`)
      .then((res) => res.json())
      .then((data) => {
        setSignedIn(Boolean(data.signedIn));
        if (typeof data.stars === "number") setMyRating(data.stars);
      })
      .catch(() => setSignedIn(false));
  }, [comboId]);

  async function rate(stars: number) {
    if (saving) return;
    if (!signedIn) return; // rendered as link instead
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/combos/${comboId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message ?? "Could not save your rating.");
        return;
      }
      setMyRating(stars);
      if (typeof data.avg_rating === "number") setAvg(data.avg_rating);
      if (typeof data.rating_count === "number") setCount(data.rating_count);
    } catch {
      setMessage("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  const display = hover ?? myRating ?? 0;

  if (signedIn === false) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-1 text-lg">
          {[1, 2, 3, 4, 5].map((i) => (
            <span key={i} className={i <= Math.round(avg) ? "text-amber-400" : "text-slate-300"}>
              ★
            </span>
          ))}
          <span className="ml-1 text-sm text-slate-500">
            {avg > 0 ? `${avg.toFixed(1)} (${count})` : "No ratings yet"}
          </span>
        </div>
        <Link
          href={`/login?next=/combos/${comboSlug}`}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Sign in to rate
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-0.5 text-2xl">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              disabled={saving}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => rate(i)}
              aria-label={`Rate ${i} star${i > 1 ? "s" : ""}`}
              className={`transition-transform hover:scale-110 disabled:opacity-50 ${
                i <= display ? "text-amber-400" : "text-slate-300"
              }`}
            >
              ★
            </button>
          ))}
        </div>
        <div className="text-sm text-slate-500">
          {myRating ? (
            <span>
              You rated this <span className="font-semibold text-slate-700">{myRating}★</span> — click to change.
            </span>
          ) : (
            <span>Rate this combo</span>
          )}
        </div>
        <span className="ml-auto text-sm text-slate-500">
          Community: {avg > 0 ? `${avg.toFixed(1)} (${count})` : "unrated"}
        </span>
      </div>
      {message && <p className="mt-2 text-sm text-red-600">{message}</p>}
    </div>
  );
}
