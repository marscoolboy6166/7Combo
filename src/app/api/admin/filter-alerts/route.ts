import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-auth";

/**
 * GET  /api/admin/filter-alerts — blocked-post alerts with their state
 * POST /api/admin/filter-alerts — mark alerts as seen, or resolve one
 *
 * Staff-only (admin, owner, moderator) — the same people who review filter
 * appeals. `acknowledged` is per staff member, so every alert pops up once
 * for each of them and never again; resolved alerts never pop up at all.
 *
 * Resolution is either "confirmed" (the filter was right) or
 * "false_positive" (the filter was wrong). Deciding an appeal resolves the
 * user's open alerts too — see staff_decide_filter_appeal.
 */

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42883" || /function .* does not exist/i.test(error?.message ?? "");
}

const MIGRATION_HINT = "Filter-alert migration missing — run supabase/filter-alerts.sql.";

export async function GET() {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) {
    return NextResponse.json({ message: gate.error ?? "Unauthorized" }, { status: gate.status });
  }

  const { data, error } = await gate.supabase.rpc("admin_list_filter_events");
  if (error) {
    if (isMissingFunction(error)) {
      return NextResponse.json({ message: MIGRATION_HINT, events: [] }, { status: 409 });
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) {
    return NextResponse.json({ message: gate.error ?? "Unauthorized" }, { status: gate.status });
  }

  let body: { action?: unknown; ids?: unknown; id?: unknown; resolution?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  // ---------------- mark as seen (per staff member) ----------------
  if (body.action === "ack") {
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((n): n is number => typeof n === "number" && Number.isInteger(n))
      : [];
    if (ids.length === 0 || ids.length > 200) {
      return NextResponse.json({ message: "ids must be 1–200 event ids." }, { status: 400 });
    }

    const { data, error } = await gate.supabase.rpc("admin_ack_filter_event", { p_ids: ids });
    if (error) {
      if (isMissingFunction(error)) {
        return NextResponse.json({ message: MIGRATION_HINT }, { status: 409 });
      }
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: "ack", marked: data ?? 0 });
  }

  // ---------------- resolve ----------------
  if (body.action === "resolve") {
    const id = body.id;
    const resolution = body.resolution;
    if (typeof id !== "number" || !Number.isInteger(id)) {
      return NextResponse.json({ message: "id must be an event id." }, { status: 400 });
    }
    if (resolution !== "confirmed" && resolution !== "false_positive") {
      return NextResponse.json(
        { message: 'resolution must be "confirmed" or "false_positive".' },
        { status: 400 },
      );
    }

    const { data: ok, error } = await gate.supabase.rpc("admin_resolve_filter_event", {
      p_id: id,
      p_resolution: resolution,
    });
    if (error) {
      if (isMissingFunction(error)) {
        return NextResponse.json({ message: MIGRATION_HINT }, { status: 409 });
      }
      if (error.code === "P0001") {
        return NextResponse.json({ message: error.message }, { status: 400 });
      }
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    if (!ok) {
      return NextResponse.json({ message: "That alert was already resolved." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, action: "resolve", resolution });
  }

  return NextResponse.json({ message: 'action must be "ack" or "resolve".' }, { status: 400 });
}
