import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-auth";

/**
 * Staff API for the bug-report queue (requireStaff gate: admin,
 * owner or moderator).
 *
 * GET   /api/admin/reports         — the queue (open first)
 * POST  /api/admin/reports         — mark reports as seen for this staff
 *        member: { action: "ack", ids: [uuid, ...] }
 * PATCH /api/admin/reports         — resolve a report (OWNER ONLY)
 *        { id, note? }
 *
 * `seen_count` is per staff member (capped at 3), so every new report pops
 * up for each of them three times before it goes quiet; resolving is what
 * closes it for everyone.
 *
 * Resolving means fixing the bug, so it is owner-only: staff can read the
 * queue and see the alert, but only the site owner closes a report. The
 * database function rejects staff too, and the old staff-level function is
 * dropped by the migration.
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
  /** How many times this staff member has already been shown it (0–3). */
  seen_count: number;
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

export async function POST(request: Request) {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) return fail(gate.error, gate.status);

  let body: { action?: unknown; ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Invalid request body.", 400);
  }

  if (body.action !== "ack") return fail('action must be "ack".', 400);

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === "string" && uuidRe.test(v))
    : [];
  if (ids.length === 0 || ids.length > 200) {
    return fail("ids must be 1–200 report ids.", 400);
  }

  const { data, error } = await gate.supabase.rpc("admin_ack_bug_report", { p_ids: ids });
  if (error) {
    if (error.code === "42883" || /function .* does not exist/i.test(error.message ?? "")) {
      return fail("Bug-report alert migration missing — run supabase/bug-report-alerts.sql.", 409);
    }
    return fail(error.message, 500);
  }

  return NextResponse.json({ ok: true, action: "ack", marked: data ?? 0 });
}

export async function PATCH(request: Request) {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) return fail(gate.error, gate.status);
  if (gate.role !== "owner") {
    return fail("Only the site owner can resolve bug reports.", 403);
  }

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
    "owner_resolve_bug_report",
    { p_report: id, p_note: note.length > 0 ? note : null },
  );
  if (error) return fail(error.message, 500);
  if (!ok) return fail("That report was already resolved.", 409);

  return NextResponse.json({ ok: true });
}
