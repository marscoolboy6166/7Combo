import { NextResponse } from "next/server";
import { searchProfiles } from "@/lib/data";

/**
 * GET /api/users?q=<search>
 * Public directory search — returns only publicly readable profile fields
 * plus public activity stats. Ban state is never exposed here.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length > 80) {
    return NextResponse.json({ message: "Search term too long." }, { status: 400 });
  }

  const users = await searchProfiles(q);
  return NextResponse.json({ users });
}
