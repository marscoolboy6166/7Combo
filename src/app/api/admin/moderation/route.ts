import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/moderation
 * Recent automatic anti-spam actions (warnings + auto-timeouts) from the
 * moderation_events log. Feeds the admin-layout popup and the Overview
 * "Auto-mod" card. Admin-only — the database function re-verifies staff.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error || !gate.supabase) {
    return NextResponse.json(
      { message: gate.error ?? "Unauthorized" },
      { status: gate.status },
    );
  }

  const { data, error } = await gate.supabase.rpc("admin_recent_moderation");
  if (error) {
    if (
      error.code === "42883" ||
      /function .* does not exist/i.test(error.message ?? "")
    ) {
      return NextResponse.json(
        { message: "Anti-spam migration missing — run supabase/anti-spam.sql.", events: [] },
        { status: 409 },
      );
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}
