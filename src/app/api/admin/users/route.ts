import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SCOPES = ["posting", "rating", "both"] as const;

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42883" || /function .* does not exist/i.test(error?.message ?? "");
}

/**
 * All reads/writes of ban state flow through security-definer functions:
 * user roles have no direct SELECT/UPDATE grants on the ban/appeal
 * columns, so direct table access would silently return nulls or fail.
 * The functions re-verify is_admin() internally as a second lock.
 */

/** GET /api/admin/users?q=<search> — list; /api/admin/users?id=<uuid> — one */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (gate.error || !gate.supabase) {
    return bad(gate.error ?? "Unauthorized", gate.status);
  }
  const supabase = gate.supabase;

  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) {
    if (isMissingFunction(error)) {
      return bad("Database migration missing.", 409);
    }
    return bad(error.message, 500);
  }

  const url = new URL(request.url);
  const idParam = url.searchParams.get("id");
  if (idParam) {
    if (!UUID_RE.test(idParam)) return bad("Valid user id is required.");
    const user = (data ?? []).find((u: { id: string }) => u.id === idParam);
    if (!user) return bad("User not found.", 404);
    return NextResponse.json({ user, viewerId: gate.userId, viewerRole: gate.role });
  }

  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const users = (data ?? []).filter(
    (u: { display_name: string; username: string | null }) =>
      !q ||
      String(u.display_name ?? "").toLowerCase().includes(q) ||
      String(u.username ?? "").toLowerCase().includes(q),
  );

  return NextResponse.json({ users, viewerId: gate.userId, viewerRole: gate.role });
}

/**
 * POST /api/admin/users
 * Body: { id, action, ... }
 *  - ban: scope = posting | rating | both; days omitted/null = permanent
 *  - unban: lifts the restriction; appeal: "upheld" marks the appeal upheld
 *  - deny_appeal: restriction stays, appeal closed forever
 *  - set_role: role = user | moderator | admin (self-change blocked in DB)
 *  - set_test: is_test = true | false (official test-account badge)
 * Guardrails (no self-ban, no admin-ban) are enforced in the DB functions.
 */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error || !gate.supabase) {
    return bad(gate.error ?? "Unauthorized", gate.status);
  }
  const supabase = gate.supabase;

  let body: {
    id?: unknown;
    action?: unknown;
    scope?: unknown;
    days?: unknown;
    reason?: unknown;
    appeal?: unknown;
    role?: unknown;
    is_test?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request body.");
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return bad("Valid user id is required.");
  const action = typeof body.action === "string" ? body.action : "";

  // ---------------- set role ----------------
  // Only admins reach this route (requireAdmin gate), and the database
  // function re-verifies + blocks changing your own role. Granting or
  // removing 'owner' is impossible through the app by design — the role is
  // assigned once, directly in the database, by the site owner.
  if (action === "set_role") {
    const role = body.role;
    if (
      typeof role !== "string" ||
      !["user", "moderator", "admin"].includes(role)
    ) {
      return bad('role must be "user", "moderator", or "admin".');
    }
    const { data: ok, error } = await supabase.rpc("admin_set_role", {
      p_target: id,
      p_role: role,
    });
    if (error) {
      if (isMissingFunction(error)) return bad("Database migration missing.", 409);
      return bad(error.message, 500);
    }
    if (!ok) return bad("User not found.", 404);
    return NextResponse.json({ ok: true, action: "set_role", role });
  }

  // ---------------- toggle official test-account flag ----------------
  if (action === "set_test") {
    if (typeof body.is_test !== "boolean") {
      return bad("is_test must be true or false.");
    }
    const { data: ok, error } = await supabase.rpc("admin_set_test", {
      p_target: id,
      p_is_test: body.is_test,
    });
    if (error) {
      if (isMissingFunction(error)) return bad("Database migration missing.", 409);
      return bad(error.message, 500);
    }
    if (!ok) return bad("User not found.", 404);
    return NextResponse.json({ ok: true, action: "set_test", is_test: body.is_test });
  }

  // ---------------- deny appeal ----------------
  if (action === "deny_appeal") {
    const { data: ok, error } = await supabase.rpc("admin_deny_appeal", { p_target: id });
    if (error) {
      if (isMissingFunction(error)) return bad("Database migration missing.", 409);
      return bad(error.message, 500);
    }
    if (!ok) return bad("There is no pending appeal to deny.");
    return NextResponse.json({ ok: true, action: "deny_appeal" });
  }

  // ---------------- unban ----------------
  if (action === "unban") {
    const appeal = body.appeal;
    if (appeal !== undefined && appeal !== "upheld") {
      return bad('appeal must be "upheld" or omitted.');
    }
    const { data: ok, error } = await supabase.rpc("admin_lift_ban", {
      p_target: id,
      p_appeal: appeal === "upheld" ? "upheld" : null,
    });
    if (error) {
      if (isMissingFunction(error)) return bad("Database migration missing.", 409);
      return bad(error.message, 500);
    }
    if (!ok) return bad("User not found.", 404);
    return NextResponse.json({ ok: true, action: "unban", appeal: appeal ?? null });
  }

  // ---------------- ban / timeout ----------------
  if (action !== "ban") {
    return bad('action must be "ban", "unban", "deny_appeal", "set_role", or "set_test".');
  }

  const scope = body.scope;
  if (typeof scope !== "string" || !SCOPES.includes(scope as (typeof SCOPES)[number])) {
    return bad('scope must be "posting", "rating", or "both".');
  }

  let banUntil: string | null = null; // null = permanent
  if (body.days !== undefined && body.days !== null && body.days !== "") {
    const days = Number(body.days);
    if (!Number.isFinite(days) || days <= 0 || days > 365) {
      return bad("days must be between 0.04 (1 hour) and 365, or omitted for permanent.");
    }
    banUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";

  const { data: ok, error } = await supabase.rpc("admin_set_ban", {
    p_target: id,
    p_scope: scope,
    p_until: banUntil,
    p_reason: reason,
  });
  if (error) {
    if (isMissingFunction(error)) return bad("Database migration missing.", 409);
    return bad(error.message, 500);
  }
  if (!ok) return bad("User not found.", 404);

  return NextResponse.json({ ok: true, action: "ban", scope, until: banUntil });
}
