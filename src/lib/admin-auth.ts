import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type Role = "user" | "moderator" | "admin" | "owner";

export type StaffGate =
  | { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; role: Role; error: null; status: 200 }
  | { supabase: null; userId: null; role: null; error: string; status: 503 | 401 | 403 };

/** Resolve the signed-in user's role, or null when signed out. */
async function currentRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Role | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  if (!profile) return null;
  if (profile.role === "owner") return "owner";
  if (profile.role === "admin" || profile.role === "moderator") return profile.role;
  // Pre-migration profiles have role='user' but may still carry is_admin.
  return profile.is_admin ? "admin" : "user";
}

/**
 * Shared chokepoint for admin/staff API authorization:
 *  1. Supabase must be configured (503 otherwise)
 *  2. Request must carry a valid signed-in session (401)
 *  3. The session's profile must satisfy the role requirement (403)
 *
 * requireAdmin: full admin powers (users, roles, bans).
 * requireStaff: admin OR moderator — catalog + combo moderation.
 *
 * Every admin API route must call one of these before touching data. The
 * same rules are also enforced by RLS/database functions — this gate exists
 * so the API layer fails fast with clear status codes and never relies on
 * the client to have done any checking.
 */
async function requireRole(minimum: "staff" | "admin"): Promise<StaffGate> {
  if (!isSupabaseConfigured()) {
    return {
      supabase: null,
      userId: null,
      role: null,
      error: "Connect Supabase (see README.md) to use the admin panel.",
      status: 503,
    };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { supabase: null, userId: null, role: null, error: "Sign in required.", status: 401 };
  }

  const role = await currentRole(supabase);
  // 'owner' passes both gates: it outranks admin and inherits staff powers.
  const allowed =
    role === "admin" ||
    role === "owner" ||
    (minimum === "staff" && role === "moderator");

  if (!allowed) {
    return {
      supabase: null,
      userId: null,
      role: null,
      error: minimum === "admin" ? "Admin access required." : "Staff access required.",
      status: 403,
    };
  }

  return { supabase, userId: userData.user.id, role, error: null, status: 200 };
}

/** Full admin powers: users, roles, test flags, bans. */
export function requireAdmin(): Promise<StaffGate> {
  return requireRole("admin");
}

/** Admin or moderator: catalog products and combo moderation only. */
export function requireStaff(): Promise<StaffGate> {
  return requireRole("staff");
}
