import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { slugify } from "@/lib/utils";

interface ItemInput {
  product_id?: string;
  quantity?: number;
  notes?: string;
}

interface ComboInput {
  title?: string;
  description?: string;
  steps?: string;
  photo_url?: string;
  items?: ItemInput[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RateLimitEvent {
  reason?: string;
  event_type?: string;
  until?: string | null;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { message: "Connect Supabase (see README.md) to post combos." },
      { status: 503 },
    );
  }

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json(
      {
        message:
          "Sign in to post combos. (Posting also requires Supabase to be connected — see README.md.)",
      },
      { status: 401 },
    );
  }

  // Ban enforcement (posting scope) — mirrors the RLS check so the user
  // gets a clear, actionable message instead of a raw database error.
  const { data: banRow } = await supabase
    .from("profiles")
    .select("ban_scope, ban_until, ban_reason")
    .eq("id", userData.user.id)
    .maybeSingle();
  const bannedFromPosting =
    Boolean(banRow?.ban_scope) &&
    (banRow!.ban_scope === "posting" || banRow!.ban_scope === "both") &&
    (!banRow?.ban_until || new Date(banRow.ban_until).getTime() > Date.now());
  if (bannedFromPosting) {
    return NextResponse.json(
      {
        message:
          banRow?.ban_reason ||
          "You are restricted from posting combos. Visit your profile for details or to submit your appeal.",
      },
      { status: 403 },
    );
  }

  let body: ComboInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const items = (body.items ?? []).filter(
    (i) => typeof i.product_id === "string" && UUID_RE.test(i.product_id),
  );

  if (title.length < 3 || title.length > 120) {
    return NextResponse.json(
      { message: "Title must be 3-120 characters." },
      { status: 400 },
    );
  }
  if (items.length === 0) {
    return NextResponse.json(
      { message: "Add at least one product to your combo." },
      { status: 400 },
    );
  }
  if (items.length > 12) {
    return NextResponse.json(
      { message: "A combo can have at most 12 products." },
      { status: 400 },
    );
  }

  // Anti-spam: the posting-limit trigger cancels attempts past the
  // quota (3/hour, warnings first, then auto-timeout) and logs a
  // moderation event. Read that event back for a friendly 429.
  const { data: limitRow } = await supabase
    .rpc("my_last_rate_limit_event", { p_action: "post" })
    .maybeSingle();
  const limitEvent = limitRow as RateLimitEvent | null;
  if (limitEvent) {
    return NextResponse.json(
      { message: limitEvent.reason ?? "You are posting too quickly — please slow down." },
      { status: 429 },
    );
  }

  // Resolve the author's display name for denormalized display
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userData.user.id)
    .maybeSingle();

  // Verify all referenced products exist
  const { data: found, error: productsError } = await supabase
    .from("products")
    .select("id")
    .in(
      "id",
      items.map((i) => i.product_id!),
    );
  if (productsError || !found || found.length !== items.length) {
    return NextResponse.json(
      { message: "One or more products could not be found." },
      { status: 400 },
    );
  }

  // Generate a unique slug
  const base = slugify(title);
  let slug = base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from("combos")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
  }

  const { data: combo, error: comboError } = await supabase
    .from("combos")
    .insert({
      slug,
      title,
      description: (body.description ?? "").trim() || null,
      steps: (body.steps ?? "").trim() || null,
      photo_url: body.photo_url || null,
      author_id: userData.user.id,
      author_name: profile?.display_name ?? null,
    })
    .select("id, slug")
    .single();

  if (comboError || !combo) {
    // A trigger-cancelled insert (rate limit raced in between the check
    // and the insert) surfaces as a PostgREST error — answer 429.
    const { data: racedRow } = await supabase
      .rpc("my_last_rate_limit_event", { p_action: "post" })
      .maybeSingle();
    const raced = racedRow as RateLimitEvent | null;
    if (raced) {
      return NextResponse.json(
        { message: raced.reason ?? "You are posting too quickly — please slow down." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { message: comboError?.message ?? "Could not create combo." },
      { status: 500 },
    );
  }

  const itemRows = items.map((i) => ({
    combo_id: combo.id,
    product_id: i.product_id!,
    quantity: Math.min(Math.max(Number(i.quantity) || 1, 1), 20),
    notes: (i.notes ?? "").trim() || null,
  }));

  const { error: itemsError } = await supabase
    .from("combo_items")
    .insert(itemRows);

  if (itemsError) {
    // Roll back the empty combo so the user can retry cleanly
    await supabase.from("combos").delete().eq("id", combo.id);
    return NextResponse.json(
      { message: `Could not save ingredients: ${itemsError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, slug: combo.slug }, { status: 201 });
}
