import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Resolve a product by slug for the given admin client, ignoring RLS
 * differences (admins bypass product RLS anyway).
 */
async function resolveProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string,
) {
  const { data } = await supabase
    .from("products")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

/**
 * POST /api/admin/products/image
 * multipart/form-data: file + slug
 * Uploads to the `product-images` storage bucket (public) and stores the
 * public URL in products.image_url. Rejects non-admins (403).
 */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error || !gate.supabase) {
    return NextResponse.json({ message: gate.error }, { status: gate.status });
  }
  const supabase = gate.supabase;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ message: "Expected multipart form data." }, { status: 400 });
  }

  const slug = String(form.get("slug") ?? "").trim();
  if (!slug) {
    return NextResponse.json({ message: "Product slug is required." }, { status: 400 });
  }

  const product = await resolveProduct(supabase, slug);
  if (!product) {
    return NextResponse.json({ message: "Product not found." }, { status: 404 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Attach an image file." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { message: "Image must be between 1 byte and 4 MB." },
      { status: 400 },
    );
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { message: "Unsupported image type. Use JPG, PNG, WebP, or GIF." },
      { status: 400 },
    );
  }

  // One canonical image per product: overwrite the same object name so
  // re-uploads replace the old picture instead of accumulating orphans.
  const objectPath = `${product.slug}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(objectPath, file, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    // The common cause: bucket exists in schema but storage policies were
    // skipped (see schema.sql) — surface an actionable message.
    return NextResponse.json(
      {
        message:
          uploadError.message.includes("new row violates row-level") ||
          uploadError.message.includes("permission")
            ? "Upload blocked by storage policy. In Supabase → Storage → product-images → Policies, allow SELECT/INSERT for the admin role."
            : uploadError.message,
      },
      { status: 500 },
    );
  }

  const { data: publicUrl } = supabase.storage
    .from("product-images")
    .getPublicUrl(objectPath);

  const imageUrl = publicUrl?.publicUrl ?? null;
  if (!imageUrl) {
    return NextResponse.json({ message: "Upload succeeded but URL generation failed." }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({ image_url: imageUrl })
    .eq("id", product.id);

  if (updateError) {
    return NextResponse.json({ message: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, image_url: imageUrl });
}

/**
 * DELETE /api/admin/products/image?slug=<slug>
 * Removes the stored image reference (keeps the object in the bucket for
 * safety — admins can clean it up in the Supabase dashboard).
 */
export async function DELETE(request: Request) {
  const gate = await requireAdmin();
  if (gate.error || !gate.supabase) {
    return NextResponse.json({ message: gate.error }, { status: gate.status });
  }
  const supabase = gate.supabase;

  const slug = new URL(request.url).searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ message: "Product slug is required." }, { status: 400 });
  }

  const product = await resolveProduct(supabase, slug);
  if (!product) {
    return NextResponse.json({ message: "Product not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("products")
    .update({ image_url: null })
    .eq("id", product.id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
