/**
 * Bulk catalog import/export — CSV & TSV parsing/serialization plus
 * normalization of one spreadsheet row into a `products` row.
 * No dependencies: hand-rolled RFC-4180-style parser.
 */

export const BULK_HEADERS = [
  "slug",
  "name_en",
  "name_th",
  "category",
  "price_thb",
  "description",
  "emoji",
  "image_url",
  "cities",
  "active",
] as const;

/** Starter file users can download, fill in, and import back. */
export const TEMPLATE_CSV = [
  "slug,name_en,name_th,category,price_thb,description,emoji,cities,active",
  "banana-cake,Banana Cake,เค้กกล้วย,dessert,25,Steamed banana cake in the pink box,🍰,",
  "mama-pork,Mama Pork Instant Noodles,มาม่าหมูสับ,instant-noodles,16,Classic pork flavor,🍜,",
  "lay-salt-seaweed,Lay's Salt & Seaweed,เลย์สาหร่ายเค็ม,chips,20,,🥔,bangkok|chiangmai,yes",
].join("\r\n");

// ---------------------------------------------------------------- parsing

/** Detect the delimiter (comma / tab / semicolon / pipe) from a sample. */
function detectDelimiter(sample: string): string {
  let best = ",";
  let bestCount = 0;
  for (const d of [",", "\t", ";", "|"]) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch === d) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** Parse CSV/TSV text (handles quotes, escaped quotes, CRLF, BOM) into a matrix. */
export function parseDelimited(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delim = detectDelimiter(text.slice(0, 5000));

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows (trailing newlines, blank lines)
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Serialize a matrix back to CSV (quoting as needed). */
export function serializeCsv(rows: string[][]): string {
  return rows
    .map((r) =>
      r
        .map((cell) => {
          const s = cell ?? "";
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

// ------------------------------------------------------------- header map

/** Header aliases → canonical field. Keys are normalized (lowercase, no separators). */
const HEADER_ALIASES: Record<string, string> = {
  slug: "slug",
  handle: "slug",
  name: "name_en",
  nameth: "name_th",
  nameen: "name_en",
  nameenglish: "name_en",
  namethai: "name_th",
  productname: "name_en",
  category: "category",
  cat: "category",
  type: "category",
  price: "price_thb",
  pricethb: "price_thb",
  pricebaht: "price_thb",
  baht: "price_thb",
  description: "description",
  desc: "description",
  notes: "description",
  emoji: "emoji",
  icon: "emoji",
  image: "image_url",
  imageurl: "image_url",
  photo: "image_url",
  img: "image_url",
  cities: "cities",
  city: "cities",
  availablein: "cities",
  availability: "cities",
  active: "is_active",
  isactive: "is_active",
  visible: "is_active",
  status: "is_active",
};

/** Map a header row to { field → column index }. null when name_en is missing. */
export function mapHeaders(cells: string[]): Record<string, number> | null {
  const index: Record<string, number> = {};
  cells.forEach((cell, i) => {
    const key = cell.toLowerCase().replace(/[^a-z0-9]/g, "");
    const field = HEADER_ALIASES[key];
    if (field && !(field in index)) index[field] = i;
  });
  return "name_en" in index ? index : null;
}

// ------------------------------------------------------------ normalizing

const CATEGORY_ALIASES: Record<string, string> = {
  drink: "drink",
  drinks: "drink",
  beverage: "drink",
  beverages: "drink",
  chip: "chips",
  chips: "chips",
  crisp: "chips",
  crisps: "chips",
  candy: "candy",
  sweet: "candy",
  sweets: "candy",
  chocolate: "candy",
  snack: "snack",
  snacks: "snack",
  sauce: "sauce",
  sauces: "sauce",
  condiment: "sauce",
  condiments: "sauce",
  readytoeat: "ready-to-eat",
  meal: "ready-to-eat",
  meals: "ready-to-eat",
  frozen: "frozen",
  icecream: "frozen",
  instantnoodles: "instant-noodles",
  noodle: "instant-noodles",
  noodles: "instant-noodles",
  cupnoodle: "instant-noodles",
  cupnoodles: "instant-noodles",
  dessert: "dessert",
  desserts: "dessert",
  bakery: "dessert",
  bread: "dessert",
  other: "other",
  misc: "other",
  miscellaneous: "other",
};

const CITY_ALIASES: Record<string, string> = {
  all: "all",
  nationwide: "all",
  everywhere: "all",
  chiangmai: "chiangmai",
  chiangrai: "chiangrai",
  bangkok: "bangkok",
  bkk: "bangkok",
  pattaya: "pattaya",
  phuket: "phuket",
};

const FALSEY = new Set(["no", "false", "0", "n", "f", "hidden", "inactive", "off"]);

export interface BulkProductRow {
  slug: string;
  name_en: string;
  name_th: string | null;
  category: string;
  price_thb: number;
  description: string | null;
  emoji: string | null;
  image_url: string | null;
  cities: string[];
  is_active: boolean;
}

export interface BulkRowResult {
  rowNumber: number;
  slug: string;
  name_en: string;
  category: string;
  price_thb: number;
  cities: string[];
  status: "ok" | "warning" | "error";
  messages: string[];
  /** Set by the API: does this slug already exist in the catalog? */
  exists?: boolean;
  product?: BulkProductRow;
}

/** Product-style slug (latin only, like the admin form uses). */
function slugifyProduct(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Normalize one data row into a products row. `taken` tracks slugs claimed
 * within this batch (mutated). Warnings never block; errors do.
 */
export function normalizeBulkRow(
  cells: string[],
  headerIndex: Record<string, number>,
  rowNumber: number,
  taken: Set<string>,
): BulkRowResult {
  const messages: string[] = [];
  const get = (field: string) => {
    const i = headerIndex[field];
    return i === undefined ? "" : (cells[i] ?? "").trim();
  };

  // name_en (required)
  const name_en = get("name_en");
  if (!name_en) {
    return {
      rowNumber,
      slug: "",
      name_en: "",
      category: "",
      price_thb: 0,
      cities: [],
      status: "error",
      messages: ["name_en is required"],
    };
  }

  // slug (optional; generated from name; deduped within the batch)
  let slug = slugifyProduct(get("slug") || name_en);
  if (!slug) {
    slug = `product-${Date.now()}-${rowNumber}`;
    messages.push(`name has no latin characters — generated slug "${slug}"`);
  }
  if (taken.has(slug)) {
    let n = 2;
    while (taken.has(`${slug}-${n}`)) n++;
    const renamed = `${slug}-${n}`;
    messages.push(`duplicate slug in file — renamed to "${renamed}"`);
    slug = renamed;
  }
  taken.add(slug);

  // category
  const rawCat = get("category").toLowerCase().replace(/[\s_-]/g, "");
  let category = "other";
  if (rawCat) {
    const mapped =
      CATEGORY_ALIASES[rawCat] ??
      (["drink", "chips", "candy", "snack", "sauce", "ready-to-eat", "frozen", "instant-noodles", "dessert", "other"].includes(rawCat)
        ? rawCat
        : null);
    if (mapped) category = mapped;
    else messages.push(`unknown category "${get("category")}" — using "other"`);
  } else {
    messages.push("no category — using \"other\"");
  }

  // price
  let price_thb = 0;
  const rawPrice = get("price_thb").replace(/[฿,\s]/g, "");
  if (rawPrice) {
    const parsed = Number.parseFloat(rawPrice);
    if (Number.isNaN(parsed)) messages.push(`price "${get("price_thb")}" is not a number — using 0`);
    else if (parsed < 0) messages.push("negative price — using 0");
    else price_thb = Math.round(parsed * 100) / 100;
  } else {
    messages.push("no price — using 0");
  }

  // cities
  const cities: string[] = [];
  for (const token of get("cities").split(/[,;|/]/)) {
    const t = token.trim().toLowerCase().replace(/\s+/g, "");
    if (!t) continue;
    const mapped = CITY_ALIASES[t];
    if (!mapped) {
      messages.push(`unknown city "${token.trim()}" — skipped`);
      continue;
    }
    if (!cities.includes(mapped)) cities.push(mapped);
  }
  if (cities.length === 0) cities.push("all");

  // emoji / description / image
  let emoji = get("emoji") || null;
  if (emoji && emoji.length > 16) {
    messages.push("emoji longer than 16 characters — ignored");
    emoji = null;
  }
  let image_url = get("image_url") || null;
  if (image_url && !/^https?:\/\//i.test(image_url)) {
    messages.push("image_url must start with http(s):// — ignored");
    image_url = null;
  }

  // active flag
  const rawActive = get("is_active").toLowerCase();
  const is_active = rawActive === "" ? true : !FALSEY.has(rawActive);

  const hasErrors = false; // only a missing name_en errors today
  const status: BulkRowResult["status"] = hasErrors
    ? "error"
    : messages.length > 0
      ? "warning"
      : "ok";

  return {
    rowNumber,
    slug,
    name_en,
    category,
    price_thb,
    cities,
    status,
    messages,
    product: {
      slug,
      name_en,
      name_th: get("name_th") || null,
      category,
      price_thb,
      description: get("description") || null,
      emoji,
      image_url,
      cities,
      is_active,
    },
  };
}
