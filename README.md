# 🏪 7Combo

Discover and share **7-Eleven Thailand product combos** — real products, real city
availability (Chiang Mai first), community-posted recipes and 1–5★ ratings.
Built with **Next.js 16 + Supabase + Tailwind CSS 4**.

> An unofficial fan project. Not affiliated with 7-Eleven.

## Quick start (local)

```bash
npm install
npm run dev        # http://localhost:3000
```

The site works immediately with **built-in demo data** (a small catalog + example
combos, clearly labeled). To unlock the full catalog, posting, ratings, and the
admin panel, connect Supabase:

## Connect Supabase (~5 minutes)

1. **Create a project** at [supabase.com](https://supabase.com) (free tier is fine).
2. **Run the schema**: open the SQL Editor in the Supabase dashboard, paste the
   contents of [`supabase/schema.sql`](supabase/schema.sql), and run it.
   This creates the tables, Row Level Security policies, triggers, and the
   `combo-photos` storage bucket.
3. **Seed the catalog**: paste the contents of
   [`supabase/seed.sql`](supabase/seed.sql) and run it. This adds ~75 real Thai
   7-Eleven products and 8 example combos (idempotent — safe to re-run).
4. **Get your keys**: Project Settings → API. Copy the **Project URL** and the
   **anon public** key.
5. **Create `.env.local`** in the project root:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```

6. Restart `npm run dev`. The amber "Setup needed" banner disappears and the app
   is fully live.

## Enable Google sign-in (~5 minutes)

1. In Supabase: **Authentication → Sign In / Up → Google**. Keep the panel open —
   Supabase shows you the **Redirect URL** you'll need in step 3.
2. Go to [Google Cloud Console](https://console.cloud.google.com) → create (or pick)
   a project → **APIs & Services → OAuth consent screen**: External, fill in the app
   name and your email, save.
3. **Credentials → Create credentials → OAuth client ID** → type *Web application*.
   Under *Authorized redirect URIs* add the exact URL from the Supabase panel,
   it looks like:
   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret** back into the Supabase Google
   provider panel, enable it, and save.
5. Sign in at `/login` with Google. Done.

### Make yourself an admin

After your first Google sign-in:

```sql
update profiles set is_admin = true where display_name = 'Your Name';
```

(Or filter by the `id` from `auth.users`.) Then reload the site — the **Admin**
link appears in the header and `/admin` lets you maintain the product catalog.

## What's where

| Route | What it does |
|---|---|
| `/` | Hero, search, trending combos, category shortcuts, city selector |
| `/combos` | Browse/search combos, filter by category, sort by rating/new |
| `/combos/[slug]` | Combo detail: ingredients, steps, 1–5★ rating widget |
| `/products` | Catalog with search, category chips, per-city availability |
| `/products/[slug]` | Product detail + every combo that uses it |
| `/submit` | Post a combo (Google sign-in required): product picker, steps, photo |
| `/admin` | Add/edit products, prices, city availability (admin only) |
| `/login` | Google sign-in |

## Stack notes

- **Next.js 16 App Router**, Server Components for data, Route Handlers for
  auth/rating/admin APIs. Next 16's `proxy.ts` (the new middleware) keeps Supabase
  sessions fresh.
- **Supabase** with RLS everywhere: public reads, writes locked to owners/admins.
  Ratings keep `avg_rating`/`rating_count` synced via triggers.
- **Tailwind CSS 4** with design tokens in `src/app/globals.css` (`@theme`) —
  restyle the whole app by editing those variables.
- **No Supabase yet?** `src/lib/data.ts` falls back to `src/lib/demo-data.ts` and
  every page shows a labeled demo banner instead of crashing.

## Deploy (free)

1. Push this folder to a GitHub repo.
2. [Vercel](https://vercel.com) → Import the repo → add the two
   `NEXT_PUBLIC_SUPABASE_*` env vars → Deploy.
3. In Supabase → Authentication → URL Configuration, add
   `https://your-app.vercel.app/auth/callback` as an additional redirect URL.

## Roadmap ideas

Thai localization (UI strings are centralized for this), comments on combos,
user-submitted products with moderation, follows/notifications, real-time feed
updates, and a PWA wrapper for app stores.
