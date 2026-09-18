import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Combo, ComboItem, Product, Profile } from "@/lib/types";
import { DEMO_COMBOS, DEMO_PRODUCTS } from "@/lib/demo-data";

/**
 * Demo data is ONLY for the zero-setup experience (no Supabase env vars).
 * When Supabase IS configured but a fetch fails, we return empty results
 * and log loudly — never fake content in production.
 */
function fallbackCombos(error: unknown): Combo[] {
  console.error("[data] fetchCombos failed:", error);
  return isSupabaseConfigured() ? [] : DEMO_COMBOS;
}

function fallbackProducts(error: unknown): Product[] {
  console.error("[data] getProducts failed:", error);
  return isSupabaseConfigured() ? [] : DEMO_PRODUCTS;
}

/**
 * v1 note: catalog and combo volumes are small (~100 rows), so city /
 * search filtering happens in JS after fetching. Move to SQL (ilike +
 * .contains) when the catalog grows.
 */

export function isDemoData(combos: Combo[] | Product[]): boolean {
  return combos.length > 0 && "slug" in combos[0] && "demo" in combos[0];
}

export function productInCity(p: Product, city: string): boolean {
  if (city === "all") return true;
  return p.cities.includes("all") || p.cities.includes(city);
}

function comboInCity(combo: Combo, city: string): boolean {
  const items = combo.items ?? [];
  if (items.length === 0) return true;
  return items.every((i) => !i.product || productInCity(i.product, city));
}

export function comboMatchesQuery(combo: Combo, q: string): boolean {
  const needle = q.toLowerCase();
  const inText =
    combo.title.toLowerCase().includes(needle) ||
    (combo.description ?? "").toLowerCase().includes(needle) ||
    (combo.steps ?? "").toLowerCase().includes(needle);
  const inProducts = (combo.items ?? []).some((i) =>
    (i.product?.name_en ?? "").toLowerCase().includes(needle),
  );
  return inText || inProducts;
}

export function comboUsesProduct(combo: Combo, productId: string): boolean {
  return (combo.items ?? []).some((i) => i.product_id === productId);
}

export function comboInCategory(combo: Combo, category: string): boolean {
  return (combo.items ?? []).some((i) => i.product?.category === category);
}

/* ------------------------------------------------------------------ */

type ProfilesRel =
  | { id: string; display_name: string; username: string | null; avatar_url: string | null }
  | null
  | Array<{ id: string; display_name: string; username: string | null; avatar_url: string | null }>;

type ProductsRel = Product | null | Product[];

function oneOf<T>(rel: T | T[] | null | undefined): T | null {
  if (rel === null || rel === undefined) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function mapComboRow(row: {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  steps: string | null;
  photo_url: string | null;
  author_id: string | null;
  author_name: string | null;
  avg_rating: number;
  rating_count: number;
  created_at: string;
  archived?: boolean | null;
  profiles: ProfilesRel;
  combo_items: Array<{
    combo_id: string;
    product_id: string;
    quantity: number;
    notes: string | null;
    products: ProductsRel;
  }>;
}): Combo {
  const author = oneOf(row.profiles);
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    steps: row.steps,
    photo_url: row.photo_url,
    author_id: row.author_id,
    author_name: author?.display_name ?? row.author_name ?? "A snacker",
    profiles: author ?? undefined,
    avg_rating: Number(row.avg_rating),
    rating_count: row.rating_count,
    created_at: row.created_at,
    archived: row.archived === true,
    items: (row.combo_items ?? []).map(
      (ci): ComboItem => ({
        combo_id: ci.combo_id,
        product_id: ci.product_id,
        quantity: ci.quantity,
        notes: ci.notes,
        product: oneOf(ci.products) ?? undefined,
      }),
    ),
  };
}

const COMBO_SELECT = `
  id, slug, title, description, steps, photo_url, author_id, author_name,
  avg_rating, rating_count, created_at, archived,
  profiles!combos_author_id_fkey ( id, display_name, username, avatar_url ),
  combo_items ( combo_id, product_id, quantity, notes, products ( * ) )
` as const;

/** Fallback select for databases that haven't run the moderation migration yet. */
const COMBO_SELECT_NO_ARCHIVED = COMBO_SELECT.replace("created_at, archived,", "created_at,");

function isMissingArchivedColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42703" || /column .archived. does not exist/i.test(error?.message ?? "");
}

export async function fetchCombos(): Promise<Combo[]> {
  try {
    const supabase = await createClient();
    let { data, error } = await supabase
      .from("combos")
      .select(COMBO_SELECT)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(200);

    // Migration not run yet → degrade to the old select instead of failing.
    if (error && isMissingArchivedColumn(error)) {
      const retry = await supabase
        .from("combos")
        .select(COMBO_SELECT_NO_ARCHIVED)
        .order("created_at", { ascending: false })
        .limit(200);
      data = retry.data as unknown as typeof data;
      error = retry.error;
    }

    if (error) throw error;
    return (data ?? []).map(mapComboRow);
  } catch (error) {
    return fallbackCombos(error);
  }
}

export interface ComboQuery {
  q?: string;
  productSlug?: string;
  category?: string;
  city?: string;
  sort?: "top" | "new";
  productFilter?: Product[];
}

export async function getCombos(query: ComboQuery = {}): Promise<Combo[]> {
  let combos = await fetchCombos();
  const { q, productSlug, category, city, sort = "new" } = query;

  if (q) combos = combos.filter((c) => comboMatchesQuery(c, q));
  if (productSlug) {
    const target = (await getProducts()).find((p) => p.slug === productSlug);
    if (target) combos = combos.filter((c) => comboUsesProduct(c, target.id));
    else combos = [];
  }
  if (category) combos = combos.filter((c) => comboInCategory(c, category));
  if (city && city !== "all") combos = combos.filter((c) => comboInCity(c, city));

  if (sort === "top") {
    combos = [...combos].sort(
      (a, b) => b.avg_rating - a.avg_rating || b.rating_count - a.rating_count,
    );
  }
  return combos;
}

export async function getComboBySlug(slug: string): Promise<Combo | null> {
  const combos = await fetchCombos();
  return combos.find((c) => c.slug === slug) ?? null;
}

/* ------------------------------------------------------------------ */
/* Profiles                                                            */

const PROFILE_SELECT = "id, display_name, username, avatar_url, is_admin, created_at" as const;

/** Look up a public profile by its username handle (case-insensitive). */
export async function getProfileByUsername(username: string): Promise<Profile | null> {
  try {
    // Strip LIKE wildcards so a crafted URL can't match more than intended.
    const safe = username.replace(/[%_\\]/g, "");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .ilike("username", safe)
      .maybeSingle();
    if (error) throw error;
    return (data as Profile | null) ?? null;
  } catch {
    return null;
  }
}

/** Look up a public profile by its auth user id. */
export async function getProfileById(id: string): Promise<Profile | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as Profile | null) ?? null;
  } catch {
    return null;
  }
}

/** All combos authored by a given user, newest first. */
export async function getCombosByAuthor(authorId: string): Promise<Combo[]> {
  const combos = await fetchCombos();
  return combos.filter((c) => c.author_id === authorId);
}

/* ------------------------------------------------------------------ */

export async function getProducts(): Promise<Product[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("name_en");

    if (error) throw error;
    return (data ?? []) as Product[];
  } catch (error) {
    return fallbackProducts(error);
  }
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const products = await getProducts();
  return products.find((p) => p.slug === slug) ?? null;
}

export function sortProducts(products: Product[], sort: string): Product[] {
  const out = [...products];
  switch (sort) {
    case "price-asc":
      return out.sort((a, b) => Number(a.price_thb) - Number(b.price_thb));
    case "price-desc":
      return out.sort((a, b) => Number(b.price_thb) - Number(a.price_thb));
    case "new":
      return out.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    default:
      return out; // DB already returns name_en order
  }
}

export function filterProducts(
  products: Product[],
  opts: { q?: string; category?: string; city?: string; sort?: string } = {},
): Product[] {
  let out = products;
  if (opts.q) {
    const needle = opts.q.toLowerCase();
    out = out.filter(
      (p) =>
        p.name_en.toLowerCase().includes(needle) ||
        (p.name_th ?? "").includes(opts.q!) ||
        (p.description ?? "").toLowerCase().includes(needle),
    );
  }
  if (opts.category) out = out.filter((p) => p.category === opts.category);
  if (opts.city && opts.city !== "all") {
    out = out.filter((p) => productInCity(p, opts.city!));
  }
  return sortProducts(out, opts.sort ?? "name");
}
