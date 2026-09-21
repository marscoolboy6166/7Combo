# 7Combo — Roadmap & Growth Ideas

_Last updated: anti-spam auto-moderation BUILT (warnings + automatic timeouts, admin popup + Auto-mod overview card) — activate by running supabase/anti-spam.sql, then deploy._

Ask me "what's the roadmap?" anytime and I'll re-read this file.

## Current state (what's already live)

- **Site:** https://7-combo.vercel.app · repo `marscoolboy6166/7Combo` · push = auto-deploy (~90 s)
- **Works:** catalog (74 products, photos, CSV import/export), combos + star ratings, per-combo OG share cards, Google sign-in (account chooser every time), profiles + avatars, `/users` member directory with search, admin hub (`/admin`: Products, Combos, Users), roles (user / moderator / admin / **owner**), test-account flags, bans/timeouts with posting/rating scopes + visible reason, one-appeal system, ban-watcher popup, in-app confirmation modals everywhere
- **Security (verified):** owner is immutable & assignable only via SQL; owner can restrict admins, admins can't ban admins/owner/self; every admin API re-checks roles; anonymous attack suite passes
- **Gaps:** thin content (8 combos), English-only

## Growth strategy (reach)

1. **Organic short-form video over paid ads** — film 10 combo Shorts/TikToks, end each with "full recipe on 7Combo" + link in bio. Thai food content lives on TikTok/Reels.
2. **Micro-influencer seeding** — DM small Thai food creators (5k–50k followers): they post a combo, get featured + profile link.
3. **Facebook groups + Reddit** — Thai foodie/expat groups, r/Thailand, r/chiangmai. Post combo share cards natively.
4. **Tourist SEO** — "7-Eleven Thailand must buy" is a big pre-trip search; combo pages are landing pages. Build a "Tourist starter pack."
5. **LINE-first sharing** — cards already unfurl in LINE; later a LINE official account for "combo of the week."
6. **Paid ads only later** — after we know which combos convert viewers.

## Content flywheel (features that make users create content)

1. **New-this-week feed** — weekly "new on the shelves"; renewable content engine (pairs with future catalog automation).
2. **Remixes** — "made a variation of this combo" chains crediting the original author.
3. **Try-list + photo proof** — save combos, "I tried this" with photo, badges.
4. **Themed challenges** — "best under ฿50," "spiciest legal combo," Songkran collections.
5. **Collections** — user-curated lists ("hangover menu," "tourist starter pack").
6. **Leaderboards/badges** — top spotter of the month, city battles (Bangkok vs Chiang Mai).

## Agreed build order

1. ~~Deploy + share cards~~ — DONE
2. ~~Admin hub + combo moderation~~ — DONE
3. ~~Users & bans (roles, owner hierarchy, appeals)~~ — DONE and deployed
4. ~~**Anti-spam basics**~~ — BUILT: 3 posts/hour with 2 warnings then automatic timeouts (1h → 24h), re-rate burst limit (5 per combo / 10 min), staff roles only are exempt (is_test is a badge — test accounts are NOT exempt), all enforced by database triggers; admin popup + Auto-mod card. Enforcement verified live in the DB; UI shipped with the deploy.
5. **Site necessities pack** — contact-me link in the footer, Q&A/FAQ section, bug-report form (trust builders before promotion) — ON HOLD until the site has its own dedicated email
6. ~~**Comments on combos**~~ — BUILT: flat comments on every combo page, posting-scope ban enforcement + comment flood limits wired into the anti-spam triggers, staff hide/unhide/delete inline. **Activate by running `supabase/comments.sql`** (one paste; requires anti-spam SQL already run — it is).
7. **Language detector / friendly-content filter** — gently nudge or auto-flag combo text written in unsupported languages (pairs with Thai localization), plus basic profanity/spam text filtering. Roadmap only for now.
8. **More sign-in options** — email magic links / password as a fallback to Google
9. **User settings expansion** — notification prefs, default city, profile-visibility toggles
10. **Cosmetics** — theme system: colors, decorations, seasonal banners (the "Site cosmetics" admin tile)
11. **User search upgrade** — a small dedicated find-members section beyond the directory sort
12. **Privacy/terms page**
13. **Seed 30–40 realistic combos** so the site isn't empty for the first wave
14. **Try-list loop** → **remixes** → **collections** → **challenges/leaderboards**
15. **New-this-week feed** (later: catalog automation program)
16. **Thai language** localization
17. Start promotion (FB groups, Reddit, Shorts) once 4–13 are in place

## Optional shinies

Custom domain on Vercel · LINE share victory-lap test · edit-in-place product modal · Run Mode PWA (in-store checklist) · pairing engine ("goes well with" suggestions) · notification center (rated / appeal decided / restricted)

## Operational scars (do not relearn)

- Port must be pinned when starting locally: `node node_modules/next/dist/bin/next dev -p 3000`
- Verify Vercel deploys via `api.github.com/repos/marscoolboy6166/7Combo/commits/<sha>/status` (not chunk grepping)
- Browser cache: hard-refresh after deploys (Ctrl+Shift+R)
- If prod data goes empty: check Vercel env vars first (the swapped-URL incident)
- Combo query pins `profiles!combos_author_id_fkey` (PGRST201 ambiguity fix)
- Supabase SQL editor runs each paste as ONE transaction — a mid-block error rolls back everything; if a function's return shape changes, `drop function` before `create or replace`
- schema.sql changes touching grants/policies must ship as a chat SQL block the user runs — revoke-before-grant on every admin function
