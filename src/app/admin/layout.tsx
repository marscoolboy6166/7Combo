"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Client shell for the admin area: renders the gate state (checking /
 * staff-only / no-Supabase) until /api/admin/session confirms the caller's
 * role, then shows the section nav around the active page.
 *
 * Roles: admin sees everything; moderator sees catalog + combo moderation
 * only (user management is admin-only, enforced again by every API).
 *
 * The server-side API gates (requireAdmin/requireStaff) are the real
 * security boundary — this layout is UX, not enforcement.
 */

const ADMIN_SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/combos", label: "Combos" },
  { href: "/admin/users", label: "Users" },
] as const;

const MODERATOR_SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/combos", label: "Combos" },
] as const;

const SOON = [
  { label: "Site cosmetics" },
] as const;

type Gate = "loading" | "forbidden" | "no-supabase" | "admin" | "moderator";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<Gate>("loading");
  const pathname = usePathname();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const health = await fetch("/api/health").then((r) => r.json());
        if (!health.supabaseConfigured) {
          setGate("no-supabase");
          return;
        }
        const res = await fetch("/api/admin/session");
        const data = await res.json().catch(() => ({ isAdmin: false, isModerator: false }));
        if (data.isAdmin) setGate("admin");
        else if (data.isModerator) setGate("moderator");
        else setGate("forbidden");
      } catch {
        setGate("forbidden");
      }
    })();
  }, []);

  if (gate === "loading") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 text-center text-sm text-slate-500">
        Checking access…
      </main>
    );
  }

  if (gate === "no-supabase") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-sm text-amber-800">
          <h1 className="mt-2 text-lg font-bold">Supabase is not connected yet</h1>
          <p className="mt-2">
            The admin panel needs the database. Follow the setup steps in <code>README.md</code>,
            then reload this page.
          </p>
        </div>
      </main>
    );
  }

  if (gate === "forbidden") {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <span className="text-5xl">🔐</span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Staff only</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in with an account that has the admin or moderator role.
          </p>
          <Link
            href="/login?next=/admin"
            className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Sign in
          </Link>
          <p className="mt-4 text-xs text-slate-400">
            Staff access is granted by the site owner via the admin panel.
          </p>
        </div>
      </main>
    );
  }

  const sections = gate === "admin" ? ADMIN_SECTIONS : MODERATOR_SECTIONS;
  // Moderators landing on a users URL still render the page; its API calls
  // will 403 and the page shows the refusal — no data leaks.

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight">Admin</h1>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
          {gate === "admin" ? "admin session verified" : "moderator session verified"}
        </span>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Admin sections">
        {sections.map((s) => {
          const active = pathname === s.href;
          return (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-semibold transition",
                active
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {s.label}
            </Link>
          );
        })}
        {gate === "admin" &&
          SOON.map((s) => (
            <span
              key={s.label}
              title="Coming in a future update"
              className="cursor-not-allowed rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-400"
            >
              {s.label} <span className="text-[10px] uppercase">soon</span>
            </span>
          ))}
      </nav>

      <div className="mt-6">{children}</div>
    </div>
  );
}
