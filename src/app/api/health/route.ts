import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function GET() {
  return NextResponse.json({ ok: true, supabaseConfigured: isSupabaseConfigured() });
}
