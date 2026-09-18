# 7Combo — Roadmap & Growth Ideas

_Last updated: after the admin hub + combo moderation release (commit 3f6d372, live)._

Ask me "what's the roadmap?" anytime and I'll re-read this file.

## Current state (what's already live)

- **Site:** https://7-combo.vercel.app · repo `marscoolboy6166/7Combo` · push = auto-deploy (~90 s)
- **Works:** catalog (74 products, photos, CSV import/export), combos + star ratings, per-combo OG share cards (unfurl in LINE/Facebook), Google sign-in, profiles + avatars, admin hub (`/admin`: Products, Combos moderation — archive/edit/delete with confirmation modal), hardened security (shared requireAdmin gate + RLS, verified)
- **Database:** moderation SQL live (archived column + admin policies), avatars bucket live, username signup trigger fixed
- **Open to anyone with a Google account** — no bans tool yet, no anti-spam, thin content (8 combos)

## Growth strategy (reach)

1. **Organic short-form video over paid ads** — film 10 combo Shorts/TikToks, end each with "full recipe on 7Combo" + link in bio. Thai food content lives on TikTok/Reels; YouTube ads are low-intent for an unmonetized site.
2. **Micro-influencer seeding** — DM small Thai food creators (5k–50k followers): they post a combo, get featured + profile link; each one brings an audience and a combo.
3. **Facebook groups + Reddit** — Thai foodie/expat groups (Chiang Mai has huge ones), r/Thailand, r/chiangmai. Post combo share cards natively — the OG cards are built for this.
4. **Tourist SEO** — "7-Eleven Thailand must buy" is a big pre-trip search. English-first combo pages are landing pages; build a "Tourist starter pack" collection.
5. **LINE-first sharing** — cards already unfurl in LINE; later add a LINE official account for "combo of the week" pushes.
6. **Paid ads only later** — and only after we know which combos convert viewers.

## Content flywheel (features that make users create content)

1. **New-this-week feed** — weekly "new on the shelves" from 7-Eleven Thailand; renewable content engine (pairs with the future catalog-automation idea).
2. **Remixes** — "made a variation of this combo" chains crediting the original author (TikTok duet culture for snacks).
3. **Try-list + photo proof** — save combos, "I tried this" with photo, badges; social proof that converts strangers.
4. **Themed challenges** — "best under ฿50," "spiciest legal combo," Songkran/summer collections; monthly rhythm.
5. **Collections** — user-curated lists ("hangover menu," "exam week fuel," "tourist starter pack").
6. **Leaderboards/badges** — top spotter of the month, city battles (Bangkok vs Chiang Mai).

## Agreed build order

1. ~~Deploy + share cards~~ — DONE
2. ~~Admin hub + combo moderation~~ — DONE
3. **Users & bans section** (member list, search, ban controls) — moderation must precede promotion
4. **Anti-spam basics** (rate limits on posting/rating)
5. **Privacy/terms page**
6. **Seed 30–40 realistic combos** so the site isn't empty for the first wave
7. **Try-list loop** → then **remixes** → **collections** → **challenges/leaderboards**
8. **New-this-week feed** (later: catalog automation program)
9. **Thai language** localization
10. Start promotion (FB groups, Reddit, Shorts) once 3–7 are in place

## Optional shinies

Custom domain on Vercel · LINE share victory-lap test · edit-in-place product modal · Run Mode PWA (in-store checklist) · pairing engine ("goes well with" suggestions)

## Operational scars (do not relearn)

- Port must be pinned when starting locally: `node node_modules/next/dist/bin/next start -p 3000`
- Verify Vercel deploys via `api.github.com/repos/marscoolboy6166/7Combo/commits/<sha>/status` (not chunk grepping)
- Browser cache: hard-refresh after deploys (Ctrl+Shift+R)
- If prod data goes empty: check Vercel env vars first (the swapped-URL incident)
- Combo query pins `profiles!combos_author_id_fkey` (PGRST201 ambiguity fix)
