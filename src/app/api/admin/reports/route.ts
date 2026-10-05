import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-auth";

/**
 * Staff API for the bug-report queue (requireStaff gate: admin,
 * owner or moderator).
 *
 * GET   /api/admin/reports         — the queue (open first)
 * PATCH /api/admin/reports         — resolve a report
 *        { id, note? }
 *
 * The same rules are enforced in the database functions
 * (admin_list_bug_reports / staff_resolve_bug_report both check
 * is_staff()) — this gate exists so the API fails fast with clear
 * status codes.
 */

interface ReportRow {
  id: string;
  user_id: string;
  display_name: string | null;
  username: string | null;
  page_url: string | null;
  description: string;
  status: string;
  staff_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

function fail(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function GET() {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) return fail(gate.error, gate.status);

  // Missing table (migration not run) degrades to an empty queue
  // and flags the UI so staff see the one-time setup step.
  const { data, error } = await gate.supabase.rpc("admin_list_bug_reports");
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) {
      return NextResponse.json({ reports: [], migrationNeeded: true });
    }
    return fail(error.message, 500);
  }

  return NextResponse.json({
    reports: (data ?? []) as unknown as ReportRow[],
    migrationNeeded: false,
  });
}

export async function PATCH(request: Request) {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) return fail(gate.error, gate.status);

  let body: { id?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", 400);
  }

  const id = typeof body.id === "string" ? body.id : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (!id) return fail("Missing report id.", 400);
  if (note.length > 1000) {
    return fail("Staff notes are limited to 1000 characters.", 400);
  }

  const { data: ok, error } = await gate.supabase.rpc(
    "staff_resolve_bug_report",
    { p_report: id, p_note: note.length > 0 ? note : null },
  );
  if (error) return fail(error.message, 500);
  if (!ok) return fail("That report was already resolved.", 409);

  return NextResponse.json({ ok: true });
}
