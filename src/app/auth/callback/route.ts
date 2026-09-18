import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/login?error=setup`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Surface the real cause on the login screen instead of swallowing it:
    // stale PKCE cookies, used codes, and provider errors all look
    // identical to the user otherwise.
    const reason = encodeURIComponent(error.message.slice(0, 200));
    return NextResponse.redirect(`${origin}/login?error=auth&reason=${reason}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth&reason=${encodeURIComponent("No authorization code was returned.")}`);
}
