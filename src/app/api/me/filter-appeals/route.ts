import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * GET  /api/me/filter-appeals — the signed-in user's appeal history.
 * POST /api/me/filter-appeals — file an appeal against a filter rejection.
 *
 * One pending appeal per user (enforced by a partial unique index in the
 * database, re-checked here for a friendly message).
 */

interface AppealRow {
  id: string;
  kind: string;
  status: string;
  filter_reason: string;
  created_at: string;
  decided_at: string | null;
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ appeals: [], signedIn: false });
  }
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ appeals: [], signedIn: false });
  }

  // Missing table (migration not run) degrades to an empty history.
  const { data, error } = await supabase.rpc("my_filter_appeals");
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) {
      return NextResponse.json({ appeals: [], signedIn: true });
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    appeals: (data ?? []) as unknown as AppealRow[],
    signedIn: true,
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { message: "Connect Supabase (see README.md) to submit appeals." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ message: "Sign in to submit an appeal." }, { status: 401 });
  }

  let body: {
    kind?: unknown;
    flaggedText?: unknown;
    filterReason?: unknown;
    context?: unknown;
    appealText?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const kind = body.kind === "combo" || body.kind === "comment" ? body.kind : null;
  const flaggedText = typeof body.flaggedText === "string" ? body.flaggedText.trim() : "";
  const filterReason = typeof body.filterReason === "string" ? body.filterReason.trim() : "";
  const appealText = typeof body.appealText === "string" ? body.appealText.trim() : "";

  if (!kind || flaggedText.length === 0 || filterReason.length === 0) {
    return NextResponse.json(
      { message: "Missing appeal details — please use the appeal button next to the filter message." },
      { status: 400 },
    );
  }
  if (appealText.length < 10) {
    return NextResponse.json(
      { message: "Please write at least 10 characters so we understand what happened." },
      { status: 400 },
    );
  }
  if (appealText.length > 1000) {
    return NextResponse.json(
      { message: "Appeals are limited to 1000 characters." },
      { status: 400 },
    );
  }
  // The appeal text itself goes through the language rule only — a user
  // writing their appeal in Thai script is fine.
  const context =
    body.context && typeof body.context === "object" && !Array.isArray(body.context)
      ? body.context
      : null;

  const { data: appealId, error } = await supabase.rpc("submit_filter_appeal", {
    p_kind: kind,
    p_flagged: flaggedText,
    p_reason: filterReason,
    p_context: context,
    p_appeal_text: appealText,
  });

  if (error) {
    const friendly = /already have an appeal/i.test(error.message)
      ? error.message
      : /schema cache|does not exist/i.test(error.message)
        ? "The appeals system is not active yet — try again in a little while."
        : error.message;
    return NextResponse.json({ message: friendly }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: true,
      id: appealId,
      message: "Appeal submitted — a moderator will review it soon.",
    },
    { status: 201 },
  );
}
