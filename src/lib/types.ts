export interface Product {
  id: string;
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
  created_at: string;
}

export type UserRole = "user" | "moderator" | "admin" | "owner";

export interface Profile {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  role: UserRole;
  /** Official test-account marker — cosmetic badge only, no permissions. */
  is_test: boolean;
  created_at: string;
}

/** Profile row as seen by admins — includes role, test flag, ban/appeal state. */
export interface AdminProfile {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  role: UserRole;
  is_test: boolean;
  created_at: string;
  ban_scope: "posting" | "rating" | "both" | null;
  ban_until: string | null;
  ban_reason: string | null;
  ban_at: string | null;
  appeal_status: "none" | "pending" | "denied" | "upheld" | null;
  appeal_text: string | null;
  appeal_at: string | null;
}

/** A user's own ban/appeal state, as returned by /api/me/ban. */
export interface MyBan {
  banned: boolean;
  scope: "posting" | "rating" | "both" | null;
  until: string | null;
  reason: string | null;
  appeal_status: "none" | "pending" | "denied" | "upheld";
  can_appeal: boolean;
}

/** Public per-user stats for profiles and the user directory. */
export interface UserStats {
  combos_posted: number;
  ratings_received: number;
  ratings_given: number;
}

export interface ComboItem {
  combo_id: string;
  product_id: string;
  quantity: number;
  notes: string | null;
  product?: Product;
}

export interface Combo {
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
  /** True when an admin has hidden this combo from the public site. */
  archived?: boolean;
  items?: ComboItem[];
  profiles?: Pick<
    Profile,
    "id" | "display_name" | "username" | "avatar_url"
  > | null;
}
