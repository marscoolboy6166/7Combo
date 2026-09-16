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

export interface Profile {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
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
  items?: ComboItem[];
  profiles?: Pick<
    Profile,
    "id" | "display_name" | "username" | "avatar_url"
  > | null;
}
