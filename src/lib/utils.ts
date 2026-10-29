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

/** Privileges a staff member gets in their own profile popup once promoted. */
export const ROLE_PRIVILEGES_BY_ROLE: Record<"moderator" | "admin", string> = {
  moderator: "Create and edit your own combos and products, and manage your upload count.",
  admin: "Moderation powers: ban or timeout any member, review appeals, and set test flags.",
};

/** Granular help text shown in confirm modals when granting roles. */
export const ROLE_GRANULARITY: Record<"moderator" | "admin", { confirmLabel: string; help: string }> = {
  moderator: {
    confirmLabel: "Make moderator",
    help: "Moderators can post and edit combos and products, and manage their upload count.",
  },
  admin: {
    confirmLabel: "Make admin",
    help: "Admins get all moderator powers plus banning/timeouts, appeals, and test flags.",
  },
};
