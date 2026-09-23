import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-auth";

/**
 * Staff API for filter appeals + whitelist (requireStaff gate: admin,
 * owner or moderator).
 *
 * GET    /api/admin/filter-appeals          — queue + whitelist
 * PATCH  /api/admin/filter-appeals          — decide an appeal
 *        { id, action: "approve" | "reject" }
 * POST   /api/admin/filter-appeals          — whitelist a phrase { phrase }
 * DELETE /api/admin/filter-appeals?id=      — remove a whitelist entry
 */

interface AppealRow {
  id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  kind: string;
  status: string;
  flagged_text: string;
  filter_reason: string;
  context: {
    title?: string;
    description?: string | null;
    steps?: string | null;
    photo_url?: string | null;
    items?: Array<{ product_id: string; quantity: number; notes?: string | null }>;
  } | null;
  appeal_text: string;
  created_at: string;
  decided_at: string | null;
}

interface WhitelistRow {
  id: string;
  phrase: string;
  created_at: string;
}

function fail(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function GET() {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) return fail(gate.error, gate.status);

  const { data: appeals, error } = await gate.supabase.rpc("admin_list_filter_appeals");
  if (error && !/schema cache|does not exist/i.test(error.message)) {
    return fail(error.message, 500);
  }

  const { data: whitelist, error: wlError } = await gate.supabase
    .from("filter_whitelist")
    .select("id, phrase, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (wlError && !/schema cache|does not exist/i.test(wlError.message)) {
    return fail(wlError.message, 500);
  }

  return NextResponse.json({
    appeals: (appeals ?? []) as unknown as AppealRow[],
    whitelist: (whitelist ?? []) as unknown as WhitelistRow[],
  });
}

export async function PATCH(request: Request) {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) return fail(gate.error, gate.status);

  let body: { id?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", 400);
  }

  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action === "approve" || body.action === "reject" ? body.action : null;
  if (!id || !action) {
    return fail("Missing appeal id or action.", 400);
  }

  const { data: ok, error } = await gate.supabase.rpc("staff_decide_filter_appeal", {
    p_appeal: id,
    p_action: action,
  });
  if (error) return fail(error.message, 500);
  if (!ok) return fail("That appeal was already decided.", 409);

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) return fail(gate.error, gate.status);

  let body: { phrase?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", 400);
  }

  const phrase = typeof body.phrase === "string" ? body.phrase.trim() : "";
  if (phrase.length < 2) {
    return fail("Phrase is too short to whitelist.", 400);
  }
  if (phrase.length > 100) {
    return fail("Phrases are limited to 100 characters.", 400);
  }

  const { error } = await gate.supabase.rpc("staff_add_whitelist", { p_phrase: phrase });
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) return fail(gate.error, gate.status);

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return fail("Missing whitelist id.", 400);

  const { data: ok, error } = await gate.supabase.rpc("staff_remove_whitelist", { p_id: id });
  if (error) return fail(error.message, 500);
  if (!ok) return fail("That whitelist entry no longer exists.", 404);
  return NextResponse.json({ ok: true });
}
