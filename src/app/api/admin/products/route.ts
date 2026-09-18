import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error || !gate.supabase) {
    return NextResponse.json({ message: gate.error }, { status: gate.status });
  }
  const supabase = gate.supabase;

  const { data, error: dbError } = await supabase
    .from("products")
    .select("*")
    .order("name_en");

  if (dbError) return NextResponse.json({ message: dbError.message }, { status: 500 });
  return NextResponse.json({ products: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error || !gate.supabase) {
    return NextResponse.json({ message: gate.error }, { status: gate.status });
  }
  const supabase = gate.supabase;

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
