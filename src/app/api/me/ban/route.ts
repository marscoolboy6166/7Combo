import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * GET /api/me/ban — the signed-in user's own ban state (scope, deadline,
 * reason, appeal status). Null reason → the UI shows a generic message.
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ banned: false, signedIn: false });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ banned: false, signedIn: false });
  }

  // Read via security-definer function: users have no direct SELECT grant
  // on ban/appeal columns, by design.
  const { data: state, error } = await supabase.rpc("my_ban_state");
  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  const signedIn = true;
  const s = (state ?? {}) as {
    banned?: boolean;
    scope?: string | null;
    until?: string | null;
    reason?: string | null;
    appeal_status?: string | null;
    appeal_text?: string | null;
    appeal_at?: string | null;
    can_appeal?: boolean;
  };

  return NextResponse.json({
    banned: Boolean(s.banned),
    signedIn,
    scope: s.scope ?? null,
    until: s.until ?? null,
    reason: s.reason ?? null,
    appeal_status: s.appeal_status ?? "none",
    appeal_text: s.appeal_text ?? null,
    appeal_at: s.appeal_at ?? null,
    can_appeal: Boolean(s.can_appeal),
  });
}

/**
 * POST /api/me/ban — submit THE one appeal.
 * Enforced again server-side beyond the DB function: 403 if not eligible.
 * A second appeal attempt is permanently rejected.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ message: "Supabase not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ message: "Sign in required." }, { status: 401 });
  }

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < 10) {
    return NextResponse.json(
      { message: "Please write at least 10 characters explaining your appeal." },
      { status: 400 },
    );
  }
  if (text.length > 2000) {
    return NextResponse.json(
      { message: "Appeal must be at most 2000 characters." },
      { status: 400 },
    );
  }

  // Check eligibility first so we can return a precise error.
  const { data: state } = await supabase.rpc("my_ban_state");
  const s = (state ?? {}) as {
    banned?: boolean;
    appeal_status?: string | null;
  };
  const banned = Boolean(s.banned);
  const status = s.appeal_status ?? "none";

  if (!banned) {
    return NextResponse.json(
      { message: "You are not banned." },
      { status: 400 },
    );
  }
  if (status === "pending") {
    return NextResponse.json(
      { message: "Your appeal is already being reviewed." },
      { status: 400 },
    );
  }
  if (status === "denied" || status === "upheld") {
    return NextResponse.json(
      { message: "You have already used your one appeal." },
      { status: 403 },
    );
  }

  const { data: ok, error } = await supabase.rpc("submit_appeal", { p_text: text });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  if (!ok) {
    return NextResponse.json(
      { message: "Appeal could not be submitted — you have already used your one appeal." },
      { status: 403 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Appeal submitted. This was your one appeal — the decision is final.",
  });
}
