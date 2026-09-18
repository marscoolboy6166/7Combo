import { NextResponse } from "next/server";
import { requireAdmin, requireStaff } from "@/lib/admin-auth";

/**
 * GET /api/admin/session
 * Cheap gate-check for admin UI pages: returns the caller's role status so
 * the layout can render the right state before any data loads.
 *  - owner/admin: full panel (Users section included)
 *  - moderator: reduced panel (catalog + combo moderation only)
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error || !gate.supabase) {
    // Not an admin — is it a moderator? They get a reduced panel.
    const staff = await requireStaff();
    if (!staff.error && staff.supabase) {
      return NextResponse.json({ isAdmin: false, isModerator: true, role: "moderator", viewerId: staff.userId });
    }
    return NextResponse.json({ isAdmin: false, isModerator: false, role: null, viewerId: null, message: gate.error });
  }
  return NextResponse.json({ isAdmin: true, isModerator: false, role: gate.role, viewerId: gate.userId });
}
