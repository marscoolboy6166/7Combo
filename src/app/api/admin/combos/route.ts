import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-auth";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COMBO_SELECT = `
  id, slug, title, description, steps, photo_url, author_id, author_name,
  avg_rating, rating_count, created_at, archived,
  profiles!combos_author_id_fkey ( id, display_name, username, avatar_url ),
  combo_items ( combo_id, product_id, quantity, notes, products ( slug, name_en, emoji ) )
` as const;

/** True when the combos table lacks the `archived` column (SQL not run yet). */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42703" || /column .archived. does not exist/i.test(error?.message ?? "");
}

/**
 * GET /api/admin/combos
 * Full moderation list: live AND archived combos, with author + ingredients.
 * RLS lets admins see archived rows; this endpoint just reads them.
 */
export async function GET() {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) {
    return NextResponse.json({ message: gate.error }, { status: gate.status });
  }
  const supabase = gate.supabase;

  const { data, error } = await supabase
    .from("combos")
    .select(COMBO_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    if (isMissingColumn(error)) {
      return NextResponse.json(
        { message: "Database migration missing.", needsMigration: true },
        { status: 409 },
      );
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ combos: data ?? [] });
}

/**
 * PATCH /api/admin/combos
 * Body: { id, action: "edit" | "archive" | "unarchive", title?, description?, steps? }
 * Only whitelisted fields are ever written — rating stats and authorship
 * are untouched.
 */
export async function PATCH(request: Request) {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) {
    return NextResponse.json({ message: gate.error }, { status: gate.status });
  }
  const supabase = gate.supabase;

  let body: {
    id?: unknown;
    action?: unknown;
    title?: unknown;
    description?: unknown;
    steps?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ message: "Valid combo id is required." }, { status: 400 });
  }

  // The combo must exist; also 404-check before any write.
  const { data: existing, error: fetchError } = await supabase
    .from("combos")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError && isMissingColumn(fetchError as { code?: string; message?: string })) {
    return NextResponse.json(
      { message: "Database migration missing.", needsMigration: true },
      { status: 409 },
    );
  }
  if (!existing) {
    return NextResponse.json({ message: "Combo not found." }, { status: 404 });
  }

  const action = body.action;
  if (action === "archive" || action === "unarchive") {
    const { error } = await supabase
      .from("combos")
      .update({ archived: action === "archive" })
      .eq("id", id);
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, archived: action === "archive" });
  }

  if (action === "edit") {
    const update: Record<string, string | null> = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (title.length < 3 || title.length > 120) {
        return NextResponse.json({ message: "Title must be 3-120 characters." }, { status: 400 });
      }
      update.title = title;
    }
    if (body.description !== undefined) {
      update.description = String(body.description).trim() || null;
    }
    if (body.steps !== undefined) {
      update.steps = String(body.steps).trim() || null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ message: "Nothing to update." }, { status: 400 });
    }

    const { error } = await supabase.from("combos").update(update).eq("id", id);
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { message: 'action must be "edit", "archive", or "unarchive".' },
    { status: 400 },
  );
}

/**
 * DELETE /api/admin/combos?id=<uuid>
 * Permanently removes the combo. combo_items and ratings fall to
 * ON DELETE CASCADE at the database level.
 */
export async function DELETE(request: Request) {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) {
    return NextResponse.json({ message: gate.error }, { status: gate.status });
  }
  const supabase = gate.supabase;

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ message: "Valid combo id is required." }, { status: 400 });
  }

  const { data: existing } = await supabase.from("combos").select("id").eq("id", id).maybeSingle();
  if (!existing) {
    return NextResponse.json({ message: "Combo not found." }, { status: 404 });
  }

  const { error } = await supabase.from("combos").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
