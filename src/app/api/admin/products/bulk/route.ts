import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin-auth";
import {
  BULK_HEADERS,
  mapHeaders,
  normalizeBulkRow,
  parseDelimited,
  serializeCsv,
} from "@/lib/csv";

/** GET → download the whole catalog as CSV (Excel/Sheets friendly). */
export async function GET() {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) {
    return NextResponse.json({ message: gate.error }, { status: gate.status });
  }
  const supabase = gate.supabase;

  const { data, error: dbError } = await supabase
    .from("products")
    .select("*")
    .order("category")
    .order("name_en");

  if (dbError) return NextResponse.json({ message: dbError.message }, { status: 500 });

  const rows: string[][] = [[...BULK_HEADERS]];
  for (const p of data ?? []) {
    rows.push([
      p.slug ?? "",
      p.name_en ?? "",
      p.name_th ?? "",
      p.category ?? "other",
      String(p.price_thb ?? 0),
      p.description ?? "",
      p.emoji ?? "",
      p.image_url ?? "",
      (p.cities ?? []).join("|"),
      p.is_active === false ? "no" : "yes",
    ]);
  }

  const csv = serializeCsv(rows);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse("\ufeff" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="7combo-catalog-${date}.csv"`,
    },
  });
}

/**
 * POST → parse CSV/TSV, normalize every row, and either preview ("dry")
 * or commit ("commit"). importMode:
 *  - "merge"   → upsert by slug (default; safe)
 *  - "replace" → additionally hide every existing product not in the file
 */
export async function POST(request: Request) {
  const gate = await requireStaff();
  if (gate.error || !gate.supabase) {
    return NextResponse.json({ message: gate.error }, { status: gate.status });
  }
  const supabase = gate.supabase;

  let body: { csv?: unknown; mode?: unknown; importMode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const csv = typeof body.csv === "string" ? body.csv : "";
  const mode = body.mode === "commit" ? "commit" : "dry";
  const importMode = body.importMode === "replace" ? "replace" : "merge";

  if (!csv.trim()) {
    return NextResponse.json({ message: "Paste CSV data or choose a file first." }, { status: 400 });
  }
  if (csv.length > 4_000_000) {
    return NextResponse.json({ message: "Import too large (4 MB limit)." }, { status: 400 });
  }

  const rows = parseDelimited(csv);
  if (rows.length < 2) {
    return NextResponse.json(
      { message: "Need a header row plus at least one product row." },
      { status: 400 },
    );
  }

  const headerIndex = mapHeaders(rows[0]);
  if (!headerIndex) {
    return NextResponse.json(
      {
        message:
          'Couldn\'t find a "name_en" (or "name") column in the header row. Download the template for the expected columns.',
      },
      { status: 400 },
    );
  }

  const taken = new Set<string>();
  const results = rows.slice(1).map((cells, i) => normalizeBulkRow(cells, headerIndex, i + 2, taken));

  // Which of these slugs already exist? (drives new-vs-update reporting)
  const { data: existing } = await supabase.from("products").select("slug, is_active");
  const existingBySlug = new Map((existing ?? []).map((e) => [e.slug as string, e.is_active as boolean]));
  for (const r of results) r.exists = existingBySlug.has(r.slug);

  const ok = results.filter((r) => r.status !== "error");
  const errors = results.filter((r) => r.status === "error");
  const warnings = results.filter((r) => r.status === "warning");
  const updateCount = ok.filter((r) => r.exists).length;

  if (mode === "dry") {
    const toHide =
      importMode === "replace"
        ? [...existingBySlug.entries()].filter(([slug, active]) => active && !taken.has(slug)).length
        : 0;
    return NextResponse.json({
      mode,
      totalRows: results.length,
      toUpsert: ok.length,
      newCount: ok.length - updateCount,
      updateCount,
      toHide,
      errorCount: errors.length,
      warningCount: warnings.length,
      results,
    });
  }

  // ---- commit ----
  if (ok.length === 0) {
    return NextResponse.json({ message: "Nothing to import — every row had errors." }, { status: 400 });
  }

  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < ok.length; i += CHUNK) {
    const chunk = ok.slice(i, i + CHUNK).map((r) => r.product!);
    const { error: upsertError } = await supabase
      .from("products")
      .upsert(chunk, { onConflict: "slug" });
    if (upsertError) {
      return NextResponse.json(
        { message: `Import failed at rows ${i + 2}–${Math.min(i + CHUNK, ok.length) + 1}: ${upsertError.message}` },
        { status: 500 },
      );
    }
    upserted += chunk.length;
  }

  let hidden = 0;
  if (importMode === "replace") {
    const keepSlugs = ok.map((r) => r.slug);
    const { data: stale, error: staleError } = await supabase
      .from("products")
      .select("slug")
      .not("slug", "in", `(${keepSlugs.map((s) => `"${s}"`).join(",")})`)
      .eq("is_active", true);

    if (staleError) {
      return NextResponse.json(
        { message: `Imported, but hiding leftovers failed: ${staleError.message}`, upserted },
        { status: 500 },
      );
    }
    hidden = stale?.length ?? 0;
    if (hidden > 0) {
      const { error: hideError } = await supabase
        .from("products")
        .update({ is_active: false })
        .in(
          "slug",
          (stale ?? []).map((s) => s.slug),
        );
      if (hideError) {
        return NextResponse.json(
          { message: `Imported, but hiding leftovers failed: ${hideError.message}`, upserted },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({
    mode,
    upserted,
    hidden,
    errorCount: errors.length,
    warningCount: warnings.length,
    results,
  });
}
