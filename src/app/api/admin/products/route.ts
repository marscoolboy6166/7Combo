import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

async function requireAdmin() {
  if (!isSupabaseConfigured()) {
    return {
      supabase: null,
      error: "Connect Supabase (see README.md) to use the admin panel.",
      status: 503 as const,
    };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { supabase, error: "Sign in required.", status: 401 as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return { supabase, error: "Admin access required.", status: 403 as const };
  }
  return { supabase, userId: userData.user.id, error: null, status: 200 as const };
}

export async function GET() {
  const { supabase, error, status } = await requireAdmin();
  if (error || !supabase) return NextResponse.json({ message: error }, { status });

  const { data, error: dbError } = await supabase
    .from("products")
    .select("*")
    .order("name_en");

  if (dbError) return NextResponse.json({ message: dbError.message }, { status: 500 });
  return NextResponse.json({ products: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, error, status } = await requireAdmin();
  if (error || !supabase) return NextResponse.json({ message: error }, { status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const name_en = String(body.name_en ?? "").trim();
  if (!name_en) {
    return NextResponse.json({ message: "name_en is required." }, { status: 400 });
  }

  const slugInput = String(body.slug ?? "").trim();
  const slug =
    (slugInput ||
      name_en
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60)) || `product-${Date.now()}`;

  const row = {
    slug,
    name_en,
    name_th: String(body.name_th ?? "").trim() || null,
    category: String(body.category ?? "other"),
    price_thb: Number(body.price_thb) || 0,
    description: String(body.description ?? "").trim() || null,
    emoji: String(body.emoji ?? "").trim() || null,
    image_url: String(body.image_url ?? "").trim() || null,
    cities: Array.isArray(body.cities) && body.cities.length > 0
      ? body.cities.map(String)
      : ["all"],
    is_active: body.is_active !== false,
  };

  // Upsert by slug so editing an existing product works
  const { data, error: dbError } = await supabase
    .from("products")
    .upsert(row, { onConflict: "slug" })
    .select("id, slug")
    .single();

  if (dbError) return NextResponse.json({ message: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true, product: data });
}
