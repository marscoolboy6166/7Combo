import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ signedIn: false, stars: null });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user || !UUID_RE.test(id)) {
    return NextResponse.json({ signedIn: false, stars: null });
  }

  const { data } = await supabase
    .from("ratings")
    .select("stars")
    .eq("combo_id", id)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  return NextResponse.json({ signedIn: true, stars: data?.stars ?? null });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { message: "Connect Supabase (see README.md) to rate combos." },
      { status: 503 },
    );
  }

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json(
      { message: "Sign in to rate combos." },
      { status: 401 },
    );
  }

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      {
        message:
          "This combo comes from the built-in demo data. Connect Supabase (see README.md) to rate real combos.",
      },
      { status: 400 },
    );
  }

  let stars: unknown;
  try {
    ({ stars } = await request.json());
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  if (!Number.isInteger(stars) || (stars as number) < 1 || (stars as number) > 5) {
    return NextResponse.json({ message: "Rating must be 1-5." }, { status: 400 });
  }

  const { error } = await supabase
    .from("ratings")
    .upsert(
      {
        combo_id: id,
        user_id: userData.user.id,
        stars,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "combo_id,user_id" },
    );

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const { data: combo } = await supabase
    .from("combos")
    .select("avg_rating, rating_count")
    .eq("id", id)
    .single();

  return NextResponse.json({
    ok: true,
    stars,
    avg_rating: combo?.avg_rating ?? 0,
    rating_count: combo?.rating_count ?? 0,
  });
}
