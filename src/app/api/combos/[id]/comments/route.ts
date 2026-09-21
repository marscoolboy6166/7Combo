import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RateLimitEvent {
  reason?: string;
  event_type?: string;
  until?: string | null;
}

export interface CommentRow {
  id: string;
  combo_id: string;
  author_id: string;
  body: string;
  hidden: boolean;
  created_at: string;
  profiles: {
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
    is_test: boolean | null;
  } | null;
}

const COMMENT_SELECT =
  "id, combo_id, author_id, body, hidden, created_at, profiles:profiles!combo_comments_author_id_fkey(id, display_name, username, avatar_url, is_test)";

/** GET /api/combos/[id]/comments — live comments, newest last for display. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isSupabaseConfigured() || !UUID_RE.test(id)) {
    return NextResponse.json({ comments: [], signedIn: false, role: null });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  // RLS decides visibility: public sees live comments, staff also see
  // hidden ones. Query is identical for everyone.
  const { data, error } = await supabase
    .from("combo_comments")
    .select(COMMENT_SELECT)
    .eq("combo_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    // Table not migrated yet — degrade to empty instead of erroring.
    // Supabase surfaces a missing table as PGRST205 (schema cache).
    if (
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /does not exist|could not find the table/i.test(error.message ?? "")
    ) {
      return NextResponse.json({ comments: [], signedIn: Boolean(userData.user), role: null });
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // Staff flag so the UI can show moderation buttons (real check is server-side).
  let role: string | null = null;
  if (userData.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profile) {
      role =
        profile.role === "owner"
          ? "owner"
          : profile.role === "admin" || profile.role === "moderator"
            ? profile.role
            : profile.is_admin
              ? "admin"
              : "user";
    }
  }

  return NextResponse.json({
    // Cast through unknown: supabase-js types the embedded profile as an
    // array without generated types, but PostgREST returns an object.
    comments: (data ?? []) as unknown as CommentRow[],
    signedIn: Boolean(userData.user),
    viewerId: userData.user?.id ?? null,
    role,
  });
}

/** POST /api/combos/[id]/comments — add a comment (sign-in + not posting-banned). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { message: "Connect Supabase (see README.md) to comment." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ message: "Sign in to comment." }, { status: 401 });
  }
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { message: "This combo comes from built-in demo data — comments need the real database." },
      { status: 400 },
    );
  }

  let body: { body?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length < 1) {
    return NextResponse.json({ message: "Write something first." }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json(
      { message: "Comments are limited to 2000 characters." },
      { status: 400 },
    );
  }

  // Friendly ban explanation (RLS would silently refuse otherwise).
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
          "You are restricted from posting. Visit your profile for details or to submit your appeal.",
      },
      { status: 403 },
    );
  }

  // Anti-spam: the comment burst trigger cancels floods (8 per combo per
  // 5 min; warnings first, then auto-timeout) and logs a moderation event.
  const { data: limitRow } = await supabase
    .rpc("my_last_rate_limit_event", { p_action: "comment", p_context: id })
    .maybeSingle();
  const limitEvent = limitRow as RateLimitEvent | null;
  if (limitEvent) {
    return NextResponse.json(
      { message: limitEvent.reason ?? "You are commenting too quickly — please slow down." },
      { status: 429 },
    );
  }

  const { data: comment, error } = await supabase
    .from("combo_comments")
    .insert({ combo_id: id, author_id: userData.user.id, body: text })
    .select(COMMENT_SELECT)
    .single();

  if (error || !comment) {
    // Trigger-cancelled (rate limit raced) or RLS refusal — check for the
    // moderation event to give the friendly message.
    const { data: racedRow } = await supabase
      .rpc("my_last_rate_limit_event", { p_action: "comment", p_context: id })
      .maybeSingle();
    const raced = racedRow as RateLimitEvent | null;
    if (raced) {
      return NextResponse.json(
        { message: raced.reason ?? "You are commenting too quickly — please slow down." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { message: error?.message ?? "Could not post the comment." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, comment }, { status: 201 });
}
