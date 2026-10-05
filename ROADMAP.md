# 7Combo — Roadmap & Growth Ideas

_Last updated: authors can now delete their own combos + comments (in-app confirm, ownership re-checked server-side, RLS as second lock). Next up: #9 user settings expansion._

Ask me "what's the roadmap?" anytime and I'll re-read this file.

## Current state (what's already live)

- **Site:** https://7-combo.vercel.app · repo `marscoolboy6166/7Combo` · push = auto-deploy (~90 s)
- **Works:** catalog (74 products, photos, CSV import/export), combos + star ratings, per-combo OG share cards, Google sign-in + **email magic links** (same email = one account via automatic identity linking), profiles + avatars, `/users` member directory with search, admin hub (`/admin`: Products, Combos, Users + **Filter appeals page**, Auto-mod tab inside Users), roles (user / moderator / admin / **owner**), test-account flags, bans/timeouts with posting/rating scopes + visible reason, one-appeal system, ban-watcher popup, in-app confirmation modals everywhere, **authors delete their own combos + comments** (detail-page button + profile-grid badges; staff moderation unchanged), **friendly-content filter** (scripts/profanity/spam/links/mash) with user appeals + staff phrase whitelist, **name rules** (display names free-form, usernames letters+digits, role-gated reserved words) enforced by a DB trigger
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
5. **Site necessities pack** — BUILT, awaiting the one-time SQL paste: footer contact link + FAQ + Report-a-bug links, `/faq` Q&A page (site basics, posting/rating, accounts, moderation), `/report` bug form (sign-in required, auto-captures the page URL, content-filtered, flood caps 5 open / 10 per day), reports land in a `bug_reports` table with a staff queue at `/admin/reports` (open-first, resolve with a note the reporter sees). `SITE_EMAIL` is the real mailbox (`7combo.official@gmail.com`, deployed `7157bcc`). Code degrades gracefully until the SQL runs; paste `supabase/site-necessities.sql` (also mirrored at the bottom of `supabase/schema.sql`) into the SQL Editor.
6. ~~**Comments on combos**~~ — DONE and live (SQL run): flat comments on every combo page, posting-scope ban enforcement + comment flood limits wired into the anti-spam triggers, staff hide/unhide/delete inline, authors delete their own comments (confirmed, permanent).
7. ~~**Language detector / friendly-content filter**~~ — DONE and deployed (`30f65c3`): server-side filter on combo + comment posting. Rejects text mostly written in unsupported scripts (Cyrillic/Arabic/CJK/etc.; Thai romanization unaffected), common profanity incl. romanized Thai, promo-spam phrases, keyboard-mash, and link spam (comments are link-free; combos allow up to 3). Friendly messages tell the user why, and every rejection offers an **appeal**: users contest false positives, staff approve/reject on the dedicated `/admin/filter-appeals` page, and approved phrases go on a **whitelist** so the filter never blocks them again (SQL already run; tables verified live).
8. ~~**More sign-in options**~~ — DONE and deployed (`e8ff2c2`): **email magic links** (passwordless, shared /auth/callback with Google; email field + check-your-inbox state). Supabase auto-links any sign-in sharing a verified email into ONE account — fresh email = new account, Google with that email later = same account. Remaining: verify Auth → Providers → Email has magic link on (default) and remember the built-in sender caps ~2 emails/hour until site email + custom SMTP (same milestone as #5). LINE login stays queued (see shinies).
8b. ~~**Profile name/username rules**~~ — DONE and fully live (code deployed in `e8ff2c2`; v2 trigger verified in the database via `pg_get_functiondef`): display names free-form (symbols, duplicates) but 2–40 chars, no links/profanity; usernames 3–24 **letters+digits only**, unique, reserved route words blocked — owner/admins exempt from ALL reserved words, moderators may claim only `moderator`/`mod`; `combo` is NOT reserved (combolover14 welcome). Enforced by `validate_profile_fields` trigger (UPDATE rejects with friendly errors; INSERT auto-created profiles sanitize silently); grandfathered legacy names never block unrelated edits. Settings page mirrors the rules client-side (note: its reserved-word hint isn't role-aware yet — DB is the real gate).
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

Custom domain on Vercel · **LINE login provider** (Thailand-native sign-in; LINE Developers channel + Supabase provider config, same drill as Google) · LINE share victory-lap test · edit-in-place product modal · Run Mode PWA (in-store checklist) · pairing engine ("goes well with" suggestions) · notification center (rated / appeal decided / restricted)

## Operational scars (do not relearn)

- Port must be pinned when starting locally: `node node_modules/next/dist/bin/next dev -p 3000`
- Verify Vercel deploys via `api.github.com/repos/marscoolboy6166/7Combo/commits/<sha>/status` (not chunk grepping)
- Browser cache: hard-refresh after deploys (Ctrl+Shift+R)
- If prod data goes empty: check Vercel env vars first (the swapped-URL incident)
- Combo query pins `profiles!combos_author_id_fkey` (PGRST201 ambiguity fix)
- Supabase SQL editor runs each paste as ONE transaction — a mid-block error rolls back everything; if a function's return shape changes, `drop function` before `create or replace`
- schema.sql changes touching grants/policies must ship as a chat SQL block the user runs — revoke-before-grant on every admin function
- **Profanity lists live in TWO places** — `src/lib/text-filter.ts` (content) and the `validate_profile_fields` trigger in schema.sql (names). Update both together or name/content rules drift apart
- If file-edit tools suddenly get refused mid-session (platform gate), tell the user and end the turn — a fresh "go" message clears it; never loop on write_todos
- Magic-link/OTP signups create profiles named from the email prefix (handle_new_user); identity auto-linking means one account per verified email across all providers
