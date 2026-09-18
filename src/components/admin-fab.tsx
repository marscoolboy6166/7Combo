"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Floating admin shortcut pinned to the bottom-right corner, out of the way
 * of every other button. Renders only for signed-in admins.
 */
export default function AdminFab() {
  const [isAdmin, setIsAdmin] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let alive = true;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return;
      if (!data.user) {
        setIsAdmin(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", data.user.id)
        .maybeSingle();
      if (alive) setIsAdmin(Boolean(profile?.is_admin));
    });
    return () => {
      alive = false;
    };
  }, [pathname]);

  if (!isAdmin || pathname.startsWith("/admin")) return null;

  return (
    <Link
      href="/admin"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-700"
      title="Admin panel"
    >
      <span className="hidden sm:inline">Admin</span>
    </Link>
  );
}
