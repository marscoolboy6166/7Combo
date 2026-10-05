import Link from "next/link";
import { APP_NAME, SITE_EMAIL } from "@/lib/constants";

/**
 * Q&A / FAQ (roadmap #5 — site necessities pack).
 * Static content: the trust-building basics before promotion.
 * Sections: the site, posting & rating, accounts, moderation,
 * contact. Bug reports have their own form at /report.
 */

const SECTIONS: Array<{
  title: string;
  qa: Array<{ q: string; a: string | React.ReactNode }>;
}> = [
  {
    title: "The site",
    qa: [
      {
        q: "What is 7Combo?",
        a: `${APP_NAME} is a community notebook for 7-Eleven Thailand combos — real products from the shelves, real prices, and the little recipes people invent to make a run feel like a meal. Browse combos, rate them 1–5★, and post your own.`,
      },
      {
        q: "Is this official 7-Eleven?",
        a: "No. 7Combo is an unofficial fan project, not affiliated with 7-Eleven or CP All. Product names and prices are community-maintained and may be out of date — always check the shelf label.",
      },
      {
        q: "Which cities are covered?",
        a: "Chiang Mai and Bangkok for now — more cities land as the catalog grows. The city selector in the header filters the catalog and combos to what's actually on shelves near you.",
      },
      {
        q: "Is it free?",
        a: "Yes — browsing, posting, rating, and commenting are all free. No ads, no tracking gimmicks.",
      },
    ],
  },
  {
    title: "Posting & rating",
    qa: [
      {
        q: "How do I post a combo?",
        a: (
          <>
            Sign in, then head to <Link href="/submit" className="text-emerald-700 hover:underline">/submit</Link>. Pick the
            products from the catalog, add quantities and steps, optionally
            attach a photo, and publish. Your combo appears instantly and
            others can rate it.
          </>
        ),
      },
      {
        q: "How do ratings work?",
        a: "Anyone signed in can give a combo 1–5 stars. You can re-rate anytime (there's a short burst limit so the average can't be spammed). The average and count show on every combo card.",
      },
      {
        q: "How many combos can I post?",
        a: "About 3 per hour. Posting faster earns a warning; repeated flooding triggers an automatic timeout (1 hour, then 24 hours). Ratings and comments have their own burst limits. Staff accounts are the only exception — test accounts are badges, not exemptions.",
      },
      {
        q: "Can I edit or delete my combo?",
        a: "You can edit the title, description, steps, and photo of anything you posted. Deletion is handled by staff in the admin hub — use the contact link below if something needs removing.",
      },
    ],
  },
  {
    title: "Accounts",
    qa: [
      {
        q: "How do I sign in?",
        a: "Google sign-in or an email magic link — both at /login. Use the same email for both and they merge into one account automatically. No passwords anywhere.",
      },
      {
        q: "How do I change my name or avatar?",
        a: (
          <>
            Go to <Link href="/settings" className="text-emerald-700 hover:underline">Settings</Link>. Display names are
            free-form (2–40 characters, no links or profanity). Usernames are
            3–24 letters and digits, unique, and can&apos;t claim reserved words.
          </>
        ),
      },
    ],
  },
  {
    title: "Moderation & safety",
    qa: [
      {
        q: "Why was my post rejected?",
        a: "Every combo and comment passes a friendly-content filter: unsupported scripts, profanity (including romanized Thai), promo spam, keyboard-mash, and link spam. The rejection message tells you which rule tripped — fix the text and try again.",
      },
      {
        q: "I think the filter made a mistake. Now what?",
        a: "Every rejection offers an appeal button. Contest it from the same screen, a moderator reviews it on the Filter appeals page, and approved phrases get whitelisted so the filter never blocks them again.",
      },
      {
        q: "I was timed out or banned. Can I appeal?",
        a: "Yes — the restriction popup and your profile both have a one-appeal button. A staff member reviews it and lifts the restriction if it was unfair. Timeouts expire automatically.",
      },
      {
        q: "Something on the site is broken, or the info is wrong.",
        a: (
          <>
            Use the <Link href="/report" className="text-emerald-700 hover:underline">bug-report form</Link> — it sends the
            report straight to the staff queue with the page you were on. For
            anything else, email{" "}
            <a href={`mailto:${SITE_EMAIL}`} className="text-emerald-700 hover:underline">
              {SITE_EMAIL}
            </a>
            .
          </>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Questions, answered</h1>
      <p className="mt-2 text-sm text-slate-500">
        The essentials about {APP_NAME} — what it is, how posting works, and
        how to reach us.
      </p>

      {SECTIONS.map((section) => (
        <section key={section.title} className="mt-10">
          <h2 className="text-lg font-bold text-emerald-700">{section.title}</h2>
          <dl className="mt-4 flex flex-col gap-5">
            {section.qa.map((item) => (
              <div key={item.q} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <dt className="font-semibold text-slate-900">{item.q}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <section className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="font-bold text-emerald-900">Still stuck?</h2>
        <p className="mt-1.5 text-sm text-emerald-800">
          Report bugs from the{" "}
          <Link href="/report" className="font-semibold hover:underline">
            bug-report form
          </Link>{" "}
          (it captures the page you&apos;re on), or write to{" "}
          <a
            href={`mailto:${SITE_EMAIL}`}
            className="font-semibold hover:underline"
          >
            {SITE_EMAIL}
          </a>{" "}
          for everything else. We read everything.
        </p>
      </section>
    </main>
  );
}
