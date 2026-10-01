import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RateLimitEvent {
  reason?: string;
  event_type?: string;
  until?: string | null;
}

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

  // Ban enforcement (rating scope) — mirrors the RLS check for a clear error.
  const { data: banRow } = await supabase
    .from("profiles")
    .select("ban_scope, ban_until, ban_reason")
    .eq("id", userData.user.id)
    .maybeSingle();
  const bannedFromRating =
    Boolean(banRow?.ban_scope) &&
    (banRow!.ban_scope === "rating" || banRow!.ban_scope === "both") &&
    (!banRow?.ban_until || new Date(banRow.ban_until).getTime() > Date.now());
  if (bannedFromRating) {
    return NextResponse.json(
      {
        message:
          banRow?.ban_reason ||
          "You are restricted from rating combos. Visit your profile for details or to submit your appeal.",
      },
      { status: 403 },
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

  // Anti-spam: the re-rating trigger cancels bursts on a single combo
  // (5+ actions in 10 minutes; warnings first, then auto-timeout) and
  // logs a moderation event. Read it back for a friendly 429.
  const { data: limitRow } = await supabase
    .rpc("my_last_rate_limit_event", { p_action: "rate", p_context: id })
    .maybeSingle();
  const limitEvent = limitRow as RateLimitEvent | null;
  if (limitEvent) {
    return NextResponse.json(
      { message: limitEvent.reason ?? "You are rating too quickly — please slow down." },
      { status: 429 },
    );
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
    const { data: racedRow } = await supabase
      .rpc("my_last_rate_limit_event", { p_action: "rate", p_context: id })
      .maybeSingle();
    const raced = racedRow as RateLimitEvent | null;
    if (raced) {
      return NextResponse.json(
        { message: raced.reason ?? "You are rating too quickly — please slow down." },
        { status: 429 },
      );
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // A BEFORE trigger that returns NULL cancels the write WITHOUT an
  // error, so a fresh rate-limit hit looks like success here. Re-check
  // after the write and answer 429 if this attempt was just blocked.
  const { data: postRow } = await supabase
    .rpc("my_last_rate_limit_event", { p_action: "rate", p_context: id })
    .maybeSingle();
  const postEvent = postRow as RateLimitEvent | null;
  if (postEvent) {
    return NextResponse.json(
      { message: postEvent.reason ?? "You are rating too quickly — please slow down." },
      { status: 429 },
    );
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

/**
 * DELETE /api/combos/[id]/rating — remove the signed-in user's rating
 * from this combo ("unrate"). Rating-scope bans do NOT block this:
 * removing your rating while restricted is allowed (it reduces the
 * user's footprint) — but the burst trigger still counts the action,
 * so rapid rate/unrate cycling trips the rating anti-spam exactly
 * like re-rate spam does.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { message: "Connect Supabase (see README.md) to manage ratings." },
      { status: 503 },
    );
  }

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json(
      { message: "Sign in to manage your ratings." },
      { status: 401 },
    );
  }

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { message: "This combo comes from the built-in demo data." },
      { status: 400 },
    );
  }

  // Anti-spam pre-check: an unrate is a rating action, so a burst that
  // just tripped (within the last 5 seconds) answers 429 here.
  const { data: limitRow } = await supabase
    .rpc("my_last_rate_limit_event", { p_action: "rate", p_context: id })
    .maybeSingle();
  const limitEvent = limitRow as RateLimitEvent | null;
  if (limitEvent) {
    return NextResponse.json(
      { message: limitEvent.reason ?? "You are changing your rating too quickly — please slow down." },
      { status: 429 },
    );
  }

  // Return the removed rows so we can tell "nothing to remove" apart
  // from a trigger-cancelled delete below.
  const { data: removed, error } = await supabase
    .from("ratings")
    .delete()
    .eq("combo_id", id)
    .eq("user_id", userData.user.id)
    .select("stars");

  if (error) {
    const { data: racedRow } = await supabase
      .rpc("my_last_rate_limit_event", { p_action: "rate", p_context: id })
      .maybeSingle();
    const raced = racedRow as RateLimitEvent | null;
    if (raced) {
      return NextResponse.json(
        { message: raced.reason ?? "You are changing your rating too quickly — please slow down." },
        { status: 429 },
      );
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // A BEFORE trigger that returns NULL cancels the delete WITHOUT an
  // error, so a burst-cancelled unrate looks like zero rows removed.
  // Re-check and answer 429 if this attempt was just blocked.
  const { data: postRow } = await supabase
    .rpc("my_last_rate_limit_event", { p_action: "rate", p_context: id })
    .maybeSingle();
  const postEvent = postRow as RateLimitEvent | null;
  if (postEvent) {
    return NextResponse.json(
      { message: postEvent.reason ?? "You are changing your rating too quickly — please slow down." },
      { status: 429 },
    );
  }

  if (!removed || removed.length === 0) {
    return NextResponse.json(
      { message: "You have not rated this combo." },
      { status: 404 },
    );
  }

  const { data: combo } = await supabase
    .from("combos")
    .select("avg_rating, rating_count")
    .eq("id", id)
    .single();

  return NextResponse.json({
    ok: true,
    removedStars: removed[0]?.stars ?? null,
    avg_rating: combo?.avg_rating ?? 0,
    rating_count: combo?.rating_count ?? 0,
  });
}
