import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

/**
 * Staff comment moderation (moderator+).
 *  PATCH { id, action: "hide" | "unhide" }  — soft hide / restore
 *  DELETE ?id=…                              — permanent delete
 * The database function re-verifies is_staff() as a second lock.
 */
export async function PATCH(request: Request) {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) {
    return bad(gate.error ?? "Unauthorized", gate.status);
  }

  let body: { id?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request body.");
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) return bad("Valid comment id is required.");

  if (body.action !== "hide" && body.action !== "unhide") {
    return bad('action must be "hide" or "unhide".');
  }

  const { data: ok, error } = await gate.supabase.rpc("admin_set_comment_hidden", {
    p_comment: id,
    p_hidden: body.action === "hide",
  });
  if (error) {
    if (error.code === "42883" || /function .* does not exist/i.test(error.message ?? "")) {
      return bad("Comments migration missing — run supabase/comments.sql.", 409);
    }
    return bad(error.message, 500);
  }
  if (!ok) return bad("Comment not found.", 404);

  return NextResponse.json({ ok: true, action: body.action });
}

export async function DELETE(request: Request) {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) {
    return bad(gate.error ?? "Unauthorized", gate.status);
  }

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) return bad("Valid comment id is required.");

  const { error } = await gate.supabase
    .from("combo_comments")
    .delete()
    .eq("id", id);
  if (error) {
    return bad(error.message, 500);
  }

  return NextResponse.json({ ok: true, action: "delete" });
}
