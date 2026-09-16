/** Join class names, skipping falsy values. */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** Format a THB price, e.g. 25 -> "฿25" */
export function baht(price: number) {
  return `฿${price.toLocaleString("en-US")}`;
}

/** URL-safe slug from a title (keeps alphanumerics and dashes). */
export function slugify(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "combo";
}
