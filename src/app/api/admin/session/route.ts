import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/session
 * Cheap gate-check for admin UI pages: returns the caller's admin status
 * so the layout can render the right state before any data loads.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error || !gate.supabase) {
    return NextResponse.json(
      { isAdmin: false, message: gate.error },
      { status: gate.status },
    );
  }
  return NextResponse.json({ isAdmin: true });
}
