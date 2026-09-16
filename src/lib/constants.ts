/** Cities supported at launch. "all" in the DB means every listed city. */
export const DEFAULT_CITY = "chiangmai";

export const CITIES = [
  { value: "chiangmai", label: "Chiang Mai" },
  { value: "bangkok", label: "Bangkok" },
  { value: "chiangrai", label: "Chiang Rai" },
  { value: "pattaya", label: "Pattaya" },
  { value: "phuket", label: "Phuket" },
  { value: "all", label: "Nationwide" },
] as const;

export type CityValue = (typeof CITIES)[number]["value"];

export function cityLabel(value: string) {
  return CITIES.find((c) => c.value === value)?.label ?? value;
}

export const CATEGORIES = [
  { value: "drink", label: "Drinks", emoji: "🥤" },
  { value: "chips", label: "Chips", emoji: "🥔" },
  { value: "candy", label: "Candy", emoji: "🍬" },
  { value: "snack", label: "Snacks", emoji: "🍿" },
  { value: "sauce", label: "Sauces", emoji: "🥫" },
  { value: "ready-to-eat", label: "Ready to Eat", emoji: "🍱" },
  { value: "frozen", label: "Frozen", emoji: "🧊" },
  { value: "instant-noodles", label: "Instant Noodles", emoji: "🍜" },
  { value: "dessert", label: "Desserts", emoji: "🍰" },
  { value: "other", label: "Other", emoji: "🛒" },
] as const;

export type CategoryValue = (typeof CATEGORIES)[number]["value"];

export function categoryLabel(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function categoryEmoji(value: string) {
  return CATEGORIES.find((c) => c.value === value)?.emoji ?? "🛒";
}

export const APP_NAME = "7Combo";
export const APP_TAGLINE = "Level up your 7-Eleven run.";

/** Sorting options for product listings (public catalog + admin table). */
export const PRODUCT_SORTS = [
  { value: "name", label: "Name (A → Z)" },
  { value: "price-asc", label: "Price (low → high)" },
  { value: "price-desc", label: "Price (high → low)" },
  { value: "new", label: "Newest first" },
] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number]["value"];
