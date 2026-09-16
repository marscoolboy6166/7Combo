"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/combos", label: "Combos" },
  { href: "/products", label: "Products" },
];

interface Me {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

function AvatarBubble({
  me,
  size = "h-9 w-9",
  text = "text-lg",
}: {
  me: Me | null;
  size?: string;
  text?: string;
}) {
  if (me?.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={me.avatarUrl}
        alt=""
        className={cn(size, "rounded-full border border-slate-200 object-cover")}
      />
    );
  }
  return (
    <span
      className={cn(
        size,
        text,
        "flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-amber-100",
      )}
      aria-hidden
    >
      🧑‍🍳
    </span>
  );
}

export default function Header() {
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const avatarBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let alive = true;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return;
      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url, is_admin")
          .eq("id", data.user.id)
          .maybeSingle();
        if (!alive) return;
        setMe({
          id: data.user.id,
          email: data.user.email ?? "",
          displayName: profile?.display_name ?? "Snacker",
          avatarUrl: profile?.avatar_url ?? null,
          isAdmin: Boolean(profile?.is_admin),
        });
      } else {
        setMe(null);
      }
    });
    return () => {
      alive = false;
    };
  }, [pathname]);

  // Close the avatar dropdown when clicking elsewhere
  useEffect(() => {
    if (!avatarOpen) return;
    function onDocClick(e: MouseEvent) {
      if (avatarBoxRef.current && !avatarBoxRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [avatarOpen]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setMe(null);
    setMenuOpen(false);
    setAvatarOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <span className="text-xl">🏪</span>
          <span>
            7<span className="text-emerald-600">Combo</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                pathname === item.href
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/submit"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            + Post a combo
          </Link>
          {me ? (
            <div className="relative" ref={avatarBoxRef}>
              <button
                onClick={() => setAvatarOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full p-0.5 transition hover:ring-2 hover:ring-emerald-200"
                title={me.email}
                aria-haspopup="menu"
                aria-expanded={avatarOpen}
              >
                <AvatarBubble me={me} />
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className={cn("text-slate-400 transition", avatarOpen && "rotate-180")}
                >
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" />
                </svg>
              </button>

              {avatarOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-lg"
                >
                  <div className="border-b border-slate-100 px-4 py-2.5">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {me.displayName}
                    </p>
                    <p className="truncate text-xs text-slate-400">{me.email}</p>
                  </div>
                  <Link
                    href="/profile"
                    role="menuitem"
                    onClick={() => setAvatarOpen(false)}
                    className="block px-4 py-2.5 text-sm text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    👤 My profile
                  </Link>
                  <Link
                    href="/settings"
                    role="menuitem"
                    onClick={() => setAvatarOpen(false)}
                    className="block px-4 py-2.5 text-sm text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    ⚙️ Account settings
                  </Link>
                  <button
                    role="menuitem"
                    onClick={signOut}
                    className="block w-full px-4 py-2.5 text-left text-sm text-red-600 transition hover:bg-red-50"
                  >
                    🚪 Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Sign in
            </Link>
          )}
        </div>

        <button
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {menuOpen ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/submit"
              onClick={() => setMenuOpen(false)}
              className="mt-1 rounded-xl bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white"
            >
              + Post a combo
            </Link>
            {me ? (
              <>
                <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <AvatarBubble me={me} size="h-8 w-8" text="text-base" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{me.displayName}</p>
                    <p className="truncate text-xs text-slate-400">{me.email}</p>
                  </div>
                </div>
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  👤 My profile
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  ⚙️ Account settings
                </Link>
                <button
                  onClick={signOut}
                  className="rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  🚪 Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-600"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
