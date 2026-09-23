/**
 * Friendly-content filter (roadmap #7).
 *
 * Three lightweight checks, no external service:
 *  1. Script detection — flags text whose letters are mostly in scripts the
 *     site does not support yet (Cyrillic, Arabic, CJK, Hangul, Devanagari,
 *     Thai is ALLOWED since the site targets Thailand).
 *  2. Profanity blocklist — a small list of common English + romanized Thai
 *     profanity/slurs. Kept deliberately short; it blocks the obvious stuff.
 *  3. Obvious spam patterns — repeated characters, "http" links (comments),
 *     promo-speak.
 *
 * The result is a decision: "ok" (accept) or "flag" (reject with reason).
 * Rejections always come back as a friendly, actionable message.
 */

// ---------------------------------------------------------------- scripts --

/** Letters outside Latin/Thai/numerals are measured as a ratio of all letters. */
const NON_SUPPORTED_SCRIPT = /[\u0370-\u03FF\u0400-\u04FF\u0500-\u052F\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/g;

/** Allow up to this share of foreign-script letters before flagging. */
const MAX_FOREIGN_SCRIPT_RATIO = 0.5;

/** Need at least this many letters before the script ratio is meaningful. */
const MIN_LETTERS_FOR_SCRIPT_CHECK = 8;

// ------------------------------------------------------------- profanity --

/**
 * Substrings checked against a normalized version of the text
 * (lowercased, all non-letters collapsed to nothing, so "f u c k" or
 * "sh1t" still match). Romanized Thai profanity included.
 */
const PROFANITY = [
  // English
  "fuck",
  "shit",
  "bitch",
  "bastard",
  "cunt",
  "dickhead",
  "asshole",
  "nigger",
  "nigga",
  "faggot",
  "whore",
  "slut",
  // Romanized Thai (kept minimal to avoid false positives)
  "kway", // ควย
  "kwai", // ควาย (insult sense)
  "yed", // เย็ด
  "sommook",
  "ai hia", // เหี้ย used as an insult
] as const;

// ------------------------------------------------------------------ spam --

/** Obvious promo/spam phrases (case-insensitive substrings). */
const SPAM_PHRASES = [
  "free money",
  "make money fast",
  "click here to win",
  "crypto giveaway",
  "casino online",
  "buy followers",
  "work from home $$",
  "telegram.me/",
  "wa.me/",
  "line://",
] as const;

/** Ten or more identical characters in a row = keyboard-mash or spam art. */
const MASH_RE = /(.)\1{9,}/;

/** More than 3 URLs in one text = link spam. */
const URL_RE = /(https?:\/\/|www\.)\S+/gi;

// --------------------------------------------------------------- helpers --

/** Lowercase and collapse everything that is not a letter/digit. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True when the string contains mostly non-supported scripts. */
function foreignScript(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length < MIN_LETTERS_FOR_SCRIPT_CHECK) return false; // too short to judge
  const foreign = letters.match(NON_SUPPORTED_SCRIPT)?.length ?? 0;
  return foreign / letters.length > MAX_FOREIGN_SCRIPT_RATIO;
}

// ---------------------------------------------------------------- public --

export type FilterRule =
  | "script"
  | "profanity"
  | "spam"
  | "mash"
  | "links";

export type FilterVerdict =
  | { decision: "ok" }
  | { decision: "flag"; reason: string; rule: FilterRule };

/**
 * Full check for user-submitted content.
 *
 * @param text          the content to check
 * @param opts.noLinks  reject URLs entirely (comments); combos allow one or two
 * @param opts.allowedPhrases  staff-approved whitelist phrases (normalized here).
 *                             If one appears in the text, profanity/spam
 *                             matching is skipped for this text (language,
 *                             mash and link rules still apply).
 */
export function checkContent(
  text: string,
  opts?: { noLinks?: boolean; allowedPhrases?: string[] },
): FilterVerdict {
  if (!text.trim()) return { decision: "ok" };

  if (foreignScript(text)) {
    return {
      decision: "flag",
      rule: "script",
      reason:
        "7Combo is English-only for now — please write your text in English (Thai support is coming).",
    };
  }

  const normalized = normalize(text);
  const bypassWordChecks = (opts?.allowedPhrases ?? []).some(
    (p) => p.length >= 2 && normalized.includes(normalize(p)),
  );

  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const word of PROFANITY) {
    const target = normalize(word);
    const hit = target.includes(" ")
      ? normalized.includes(target) // multi-word phrase: collapsed match
      : target.length >= 4
        ? normalized.includes(target) // distinctive enough as substring
        : words.includes(target); // very short words: exact-token only
    if (hit) {
      if (bypassWordChecks) continue;
      return {
        decision: "flag",
        rule: "profanity",
        reason: "Your text contains language we don't allow. Please keep it friendly.",
      };
    }
  }

  for (const phrase of SPAM_PHRASES) {
    if (!bypassWordChecks && normalized.includes(normalize(phrase))) {
      return {
        decision: "flag",
        rule: "spam",
        reason: "This looks like promotional spam — 7Combo is for real snack hacks!",
      };
    }
  }

  if (MASH_RE.test(text)) {
    return {
      decision: "flag",
      rule: "mash",
      reason: "That looks like keyboard-mash — please write something readable.",
    };
  }

  const links = text.match(URL_RE)?.length ?? 0;
  if (opts?.noLinks && links > 0) {
    return {
      decision: "flag",
      rule: "links",
      reason: "Links aren't allowed in comments.",
    };
  }
  if (links > 3) {
    return {
      decision: "flag",
      rule: "links",
      reason: "Too many links — please remove a few and try again.",
    };
  }

  return { decision: "ok" };
}

/** Result of the combo-level text check. */
export interface ComboTextCheck {
  /** Friendly error for the user, or null when everything passes. */
  message: string | null;
  /** The exact text that tripped the filter (for appeals), or null. */
  flaggedText: string | null;
  /** Which rule caught it, or null. */
  rule: FilterRule | null;
}

/**
 * Check a combo's three text fields plus every ingredient note.
 * `allowedPhrases` (staff whitelist) suppresses profanity/spam hits.
 */
export function checkComboText(input: {
  title: string;
  description?: string | null;
  steps?: string | null;
  itemNotes?: string[];
  allowedPhrases?: string[];
}): ComboTextCheck {
  const fields: Array<[string, string]> = [
    ["title", input.title],
    ["description", input.description ?? ""],
    ["steps", input.steps ?? ""],
  ];
  for (const note of input.itemNotes ?? []) {
    fields.push(["ingredient note", note]);
  }
  for (const [label, value] of fields) {
    const verdict = checkContent(value, { allowedPhrases: input.allowedPhrases });
    if (verdict.decision === "flag") {
      return {
        message: `Your combo ${label}: ${verdict.reason}`,
        flaggedText: value,
        rule: verdict.rule,
      };
    }
  }
  return { message: null, flaggedText: null, rule: null };
}

/**
 * Name-safe check for profile fields (display name, username).
 * Profanity + links only — deliberately no script, length or mash rules,
 * since names are short and display names may contain any keyboard symbols.
 * Returns a friendly error, or null when the name is fine.
 */
export function checkProfileText(
  text: string,
  field: "display name" | "username",
): string | null {
  const value = text.trim();
  if (!value) return null;

  if (/(https?:\/\/|www\.)/i.test(value)) {
    return `Your ${field} can't contain links.`;
  }

  const normalized = normalize(value);
  const words = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const word of PROFANITY) {
    const target = normalize(word);
    const hit = target.includes(" ")
      ? normalized.includes(target) // multi-word phrase: collapsed match
      : target.length >= 4
        ? normalized.includes(target) // distinctive enough as substring
        : words.includes(target); // very short words: exact-token only
    if (hit) {
      return `Your ${field} contains language we don't allow. Please pick another.`;
    }
  }
  return null;
}
