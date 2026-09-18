import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type AdminGate =
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; error: null; status: 200 }
  | { supabase: null; userId: null; error: string; status: 503 | 401 | 403 };

/**
 * Single chokepoint for admin API authorization:
 *  1. Supabase must be configured (503 otherwise)
 *  2. Request must carry a valid signed-in session (401)
 *  3. The session's profile row must have is_admin = true (403)
 *
 * Every /api/admin route must call this before touching data. The same
 * rules are also enforced by RLS at the database level — this gate exists
 * so the API layer fails fast with clear status codes and never relies on
 * the client to have done any checking.
 */
export async function requireAdmin(): Promise<AdminGate> {
  if (!isSupabaseConfigured()) {
    return {
      supabase: null,
      userId: null,
      error: "Connect Supabase (see README.md) to use the admin panel.",
      status: 503,
    };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { supabase: null, userId: null, error: "Sign in required.", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return { supabase: null, userId: null, error: "Admin access required.", status: 403 };
  }

  return { supabase, userId: userData.user.id, error: null, status: 200 };
}
