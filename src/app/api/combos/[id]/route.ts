import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/combos/[id]
 * The author deletes their own combo. combo_items, ratings and
 * comments fall to ON DELETE CASCADE at the database level.
 *
 * Ownership is checked here so users get a clear message; the
 * "Authors delete own combos" RLS policy is the second lock.
 * Staff moderation (any combo) lives in /api/admin/combos.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { message: "Connect Supabase (see README.md) to delete combos." },
      { status: 503 },
    );
  }
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ message: "Valid combo id is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json(
      { message: "Sign in to delete your combos." },
      { status: 401 },
    );
  }

  const { data: combo, error: fetchError } = await supabase
    .from("combos")
    .select("id, author_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ message: fetchError.message }, { status: 500 });
  }
  if (!combo) {
    return NextResponse.json({ message: "Combo not found." }, { status: 404 });
  }
  if (combo.author_id !== userData.user.id) {
    return NextResponse.json(
      { message: "Only the author can delete this combo." },
      { status: 403 },
    );
  }

  const { error: deleteError } = await supabase.from("combos").delete().eq("id", id);
  if (deleteError) {
    return NextResponse.json({ message: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
