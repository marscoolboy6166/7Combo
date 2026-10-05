import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { checkContent } from "@/lib/text-filter";

/**
 * GET  /api/report — the signed-in user's report history.
 * POST /api/report — file a bug report { pageUrl, description }.
 *
 * The description passes the same friendly-content filter as
 * combos and comments (profanity, spam, mash, link caps — links
 * ARE allowed here since a report may reference a page). Flood
 * caps (5 open / 10 per day) are enforced by the database
 * function, which is the real gate.
 */

interface ReportRow {
  id: string;
  page_url: string | null;
  description: string;
  status: string;
  staff_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ reports: [], signedIn: false });
  }
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ reports: [], signedIn: false });
  }

  // Missing table (migration not run) degrades to an empty history.
  const { data, error } = await supabase.rpc("my_bug_reports");
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) {
      return NextResponse.json({ reports: [], signedIn: true });
    }
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    reports: (data ?? []) as unknown as ReportRow[],
    signedIn: true,
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { message: "Connect Supabase (see README.md) to submit bug reports." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ message: "Sign in to submit a bug report." }, { status: 401 });
  }

  let body: { pageUrl?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";

  if (pageUrl.length > 2000) {
    return NextResponse.json({ message: "That page address is too long." }, { status: 400 });
  }
  if (description.length < 10) {
    return NextResponse.json(
      { message: "Please describe the bug in at least 10 characters." },
      { status: 400 },
    );
  }
  if (description.length > 2000) {
    return NextResponse.json({ message: "Reports are limited to 2000 characters." }, { status: 400 });
  }

  // Same friendly-content rules as combos/comments.
  const verdict = checkContent(description);
  if (verdict.decision === "flag") {
    return NextResponse.json({ message: verdict.reason }, { status: 400 });
  }

  const { data: reportId, error } = await supabase.rpc("submit_bug_report", {
    p_page_url: pageUrl.length > 0 ? pageUrl : null,
    p_description: description,
  });

  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) {
      return NextResponse.json(
        {
          message:
            "The bug-report system is not active yet — the site-necessities migration hasn't been run.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: true,
      id: reportId,
      message: "Report submitted — thanks! Staff will review it in the queue.",
    },
    { status: 201 },
  );
}
