# UI Designs Co — Handoff

**Written:** 2026-08-28 (revised from the 2026-08-27 version)
**Purpose:** paste this into a new chat so it can pick up without re-deriving anything.
**Read this before the README or any other doc in this repo.**

---

## 1. What this is

Daniel's own business website. He sells custom websites to local trade
businesses (contractors, auto body, pest control, movers, HVAC, tree services,
driving schools) out of Queens, NY. He is a one-person operation with no
coding background — explain things plainly and never hand him a wall of steps.

- **Repo:** `C:\Users\winst\Documents\INSURANCE agent results\ui-designs-co`
- **Git remote:** https://github.com/danieljkoo92/ui-designs-co.git (branch `main`)
- **Live:** https://ui-designs-co.vercel.app
- **Deploy:** push to `main`, Vercel auto-deploys. 1–4 minutes. No build step;
  static files plus two serverless functions in `api/` sharing `api/_robots.js`.

### The offer being sold (memorize — it appears in ~8 files)

| Thing | Price | Notes |
|---|---|---|
| Free preview | $0 | Working site within 48h, before any payment, no obligation |
| **Revision deposit** | **$200** | Due before ANY revision work. **Credited toward the build.** |
| Standard build | $1,000 one-time | Live 5–7 days. 2 full redesigns included *after purchase* |
| Signature build | $3,500 one-time | Scroll-driven film / 3D. Live 10–14 days |
| Starter plan | $149/mo | Optional, only after a build |
| Grow plan | $349/mo | "Most picked" |
| Dominate plan | $697/mo | |
| AI phone agent | price on request | Never quote a number |

If you find `$100` or "first 2 edits free" anywhere, it's stale — grep and fix.
It currently reads correctly across the site, the chatbot prompt, `terms.html`
and `CLIENT-AGREEMENT.md`.

---

## 2. File map

### Pages (all live, all have canonical + BreadcrumbList JSON-LD)

| File | What it is | Indexed? |
|---|---|---|
| `index.html` | Homepage. Long scroll, cinematic video hero. Styles inline. ~50KB | yes |
| `work.html` | Portfolio gallery, 7 demos, Signature/Standard filter tabs | **noindex** |
| `plans.html` | The 3 plans in full, SEO/AEO/GEO explainer, comparison table, FAQ | yes |
| `why.html` | Sourced stats, animated charts, missed-call calculator, scanner embed | yes |
| `scan.html` | Standalone free site checker | yes |
| `how-it-works.html` | 6-step process, shows exactly where the $200 lands | yes |
| `about.html` | Who Daniel is, why $1,000 is possible | yes |
| `faq.html` | 21 questions in 4 groups, `<details>` accordions | yes |
| `terms.html`, `privacy.html`, `accessibility.html` | Legal. Use `legal.css` | yes |
| `demo-*.html` (7) | Fictional business demos | **noindex** |

`work.html` and every demo are `noindex` **and** disallowed in `robots.txt`.
**Daniel's explicit call.** The demos use invented business names, licence
numbers and reviews, so they must never be indexed as real companies.

### Shared assets

- `site.css` — the shell (tokens, header, nav, footer, buttons) for the 7 new
  pages. **`index.html` does NOT use it** — the homepage keeps its own inline
  `<style>`. Change a token in one and change it in the other.
- `site.js` — mobile nav toggle + IntersectionObserver scroll reveals.
- `scan-widget.css` / `scan-widget.js` — checker UI. Self-contained; mounts
  into any `<div data-site-check>`. Used on `index.html`, `why.html`, `scan.html`.
- `chat-widget.js` — chat bubble. Self-contained, styles included.
- `llms.txt` — plain-language summary for AI tools.
- `api/_robots.js` — shared robots.txt parser + `blockedAgents()` used by both
  `scan.js` and its test file. Never route it as an endpoint (underscore prefix).

### Design tokens (identical in `site.css` and `index.html`'s inline style)

```
--void:#0A0C10   --panel:#12161D  --edge:#232A35
--steel:#8C97A6  --white:#F2F5F9  --gold:#D9A441  --gold-dark:#B8862C
```

Headings: Playfair Display (Google Fonts). Body: system font stack.

---

## 3. The hero (`index.html`, animated intro)

Rewritten twice. The current state uses **real motion**, not CSS fades:

- Each headline is pre-split into character spans on load.
- Exits: `shatterOut` — every character blasts off in a random 3D vector with
  rotation, blur, and colour shift.
- Entrances (per-act, mapped in `ENTRANCE`):
  - `assembleIn` — chars fly in from scattered 3D positions with an overshoot
    (used on `a1`, `a5`).
  - `decodeIn` — matrix-scramble; chars cycle through random glyphs in glowing
    gold before locking to their real letter (used on `a2`, `a4`).
- Cut slides between industries (HVAC, Auto body, Roofing, Contractors) use an
  **SVG `feDisplacementMap` turbulence filter** whose scale is animated
  0 → 80 → 0, so the image liquefies out and settles in. The `feTurbulence`
  seed is re-randomised each cut.
- Cut label decodes matrix-style into the new industry name.
- Loop-back flash (`.flash.hit`) marks the loop point.
- Pause button (`#filmToggle`) still works — WCAG 2.2.2.

**Timing** (in `buildFilm()`, don't touch without a good reason): each act
holds 3.4–4.6s, closing CTA holds longest at 4.6s. Full loop is 24.4s. Daniel
spent time on this because his prior complaint was "too fast to read anything."

**Reduced-motion** kills all filter/transform animation and falls back to
plain 0.3s opacity fades.

Rated 6/10 by Daniel — the second version was a real step up from the first
(rated 4), but there's likely more room. Watch it live before assuming it's
final.

---

## 4. The site checker (`api/scan.js` + `scan-widget.js`)

Daniel's best sales tool. A visitor pastes their URL, the server fetches that
page and scores it 0–100. **No AI is involved** — every check is
deterministic. Costs nothing per scan, cannot hallucinate a finding.

### 26 checks in 4 groups

- **found** (25% of score) — title (30+ chars), meta description (70+), exactly
  one H1, `/sitemap.xml`, `/robots.txt`, Open Graph tags, image alt text
- **phone** (20%) — viewport meta, https, HTML weight (<400KB), response (<900ms)
- **calls** (25%) — `tel:` link, phone number in text, a `<form>`, address / service area
- **ai** (30%) — 9 checks, including:
  - AI-crawler access via `blockedAgents()` — real robots.txt grammar, not grep
  - Readable without JavaScript (server vs client rendering)
  - LocalBusiness JSON-LD (weight 4, heaviest single check)
  - **FAQ answers actually on the page** — walks JSON-LD, extracts every
    `FAQPage.mainEntity`, and only counts one as "rendered" if both its
    question is a visible heading AND its answer text is in the body. Under
    60% rendered → fires. Catches hubs that ship schema but load the answers
    with JavaScript.
  - **No template placeholders leaking through** — regex against visible text
    for `{{city}}`, `[LOCATION]`, `%TOKEN%`, `${var}`. Catches the classic
    city-template bug.
  - Opening hours in schema, questions in headings, quotable facts, service
    area in words, `/llms.txt`

### Scoring caps — do not weaken

A critical failure sets a ceiling the rest of the score cannot climb past:

```
AI crawlers blocked        -> max 25
client-rendered content    -> max 35
no viewport                -> max 40
placeholder token visible  -> max 45     ← added with the citable rules
no https                   -> max 45
no phone number anywhere   -> max 50
no page title              -> max 55
no LocalBusiness JSON-LD   -> max 65
```

### Calibration — regression anchors (verified live 2026-08-28)

| Site | Score |
|---|---|
| example.com (blank page) | 46 |
| homedepot.com | 62 |
| mrrooter.com | 65 |
| rotorooter.com | 65 |
| **ui-designs-co.vercel.app** | **88** |

If a change makes a national plumbing chain score 80+, the scoring has
drifted back to being flattering. Re-check against this table.

### Security — do not weaken

`api/scan.js` fetches arbitrary user-supplied URLs, so it is SSRF-hardened:

- DNS-resolves the host and rejects private, loopback, link-local (169.254.x —
  cloud metadata), CGNAT and multicast — IPv4 and IPv6 including IPv4-mapped
- Non-http(s) schemes rejected instantly, before any DNS lookup
- Manual redirect handling, max 3 hops, **every hop re-validated**
- 8s timeout, 2MB response cap, ports restricted to 80/443/8080
- Rate limit 8/min per IP (per serverless instance)
- **Fetched HTML is never echoed to the browser** — only findings

### Tests

`node test/scan.test.js` — 11 checks, must all pass:
- 8 robots-grammar unit tests
- SSRF guard against `localhost`, `127.0.0.1`, `169.254.x`, `file:///`
- Live end-to-end against rotorooter.com — proves every AI-group check label
  is present in the response, and no HTML markup leaks
- Rate-limit hits 429 after 8 requests

### Related: the citable skill

Same audit logic lives in `C:\Users\winst\projects\citable`. The two checks in
the `ai` group above (`faqhub-rendering-gap` and `template-placeholders-visible`)
are also rules in `citable/rules/technical.json`, with predicates in
`scripts/checks.mjs` and fixture tests in `scripts/checks.test.mjs`. Run:
`node scripts/checks.test.mjs` — 41 checks. If you add a check to the live
scanner, mirror it into citable and vice versa.

---

## 5. The chatbot (`api/chat.js` + `chat-widget.js`)

**Live status: `POST /api/chat` returns `{"error":"billing"}`.**

The upstream errors are now differentiated (a commit landed since HANDOFF v1):

- `config` — `ANTHROPIC_API_KEY` env var missing on Vercel
- `auth` — 401/403 from Anthropic (bad or revoked key)
- `rate` — 429
- `billing` — 402 or a message containing "credit / billing / balance / quota"
- `upstream` — any other Anthropic failure

**`billing` is the current state** — the Anthropic account balance is spent.
This is Daniel's fix, not ours: open the Anthropic Console billing page and
top up. Once he does, no code change is needed — the bot will start replying
on the next request.

### The widget degrades gracefully

`failSafe()` catches every error type and shows *"Text Daniel at 917-245-8685
and he'll answer directly."* Visitors get a usable fallback rather than a
broken box. The bot is dead weight until the balance is topped up, but
nothing on the page looks broken.

### The system prompt

Long and prescriptive. Contains: the offer, a page map of all 7 pages so the
bot can link people, the site checker as a "second close" for visitors who
already have a site, the approved statistics list, four objection scripts,
hard rules against inventing quotes, guarantees, payback periods or rankings.

Model is `claude-haiku-4-5-20251001` — chosen over Sonnet because replies are
2–4 sentences off a tight prompt and it's far cheaper per conversation.

**Widget linkifies model output.** Any `/scan.html`-style path in a reply gets
turned into a tappable anchor via a fixed page whitelist. Model output never
touches `innerHTML`. The bot's close emits `[SMS_BUTTON]...[/SMS_BUTTON]`,
which the widget replaces with a pre-filled tappable SMS link.

When editing the prompt: it's a template literal, so backticks and `${` must
be escaped. Always `node -e "require('./api/chat.js')"` after editing.

---

## 6. How to work in this repo

### Verification loop

```bash
# 1. syntax-check the serverless functions after ANY edit
node -e "require('./api/chat.js'); require('./api/scan.js'); console.log('ok')"

# 2. serve locally — python -m http.server DOES NOT WORK
python <scratchpad>/rangeserve.py 8770 "<repo path>"

# 3. real tests
node test/scan.test.js
```

**`python -m http.server` has no HTTP Range support**, so Chrome refuses to
seek the scroll-driven demo videos and the pest/auto demos look broken.
Always use the range-capable server. If you need `/api/*` locally too, write
a small Node server that `require`s the handler directly — there is no
`vercel dev` configured.

Then Playwright at **1400×900 and 390×844**. Both matter — Daniel checks on
his phone.

### Deploy + verify

```bash
git add -A && git commit -m "..." && git push
# then poll until the change actually appears:
curl -s https://ui-designs-co.vercel.app/<page> | grep -q "<something new>"
```

### Gotchas

- **CRLF warnings on every commit are normal** on this Windows checkout.
- Three style systems: `site.css` (7 new pages), inline `<style>` (`index.html`),
  `legal.css` (3 legal pages). Keep tokens in sync by hand.
- Nav markup is duplicated across all 8 pages — no templating. A nav change
  means editing 8 files. Use a scripted `python` pass.
- **Playwright here is shared with another process** — pages navigate and get
  text typed into them mid-run. If a screenshot looks wrong, re-navigate
  before concluding the page is broken.
- **Some skills edit files in parallel.** The `citable:seo-*` slash commands
  can modify HTML files (adding canonicals, breadcrumb JSON-LD, sitemap
  links). If files show unexpected diffs, they're probably intentional SEO
  additions — read before reverting.

---

## 7. Where things stand

### Done and live
- $200 deposit rolled out across every touchpoint
- 7 new pages + real top nav + footer nav
- Working site checker with 26 deterministic checks, SSRF-hardened
- Two audit findings turned into automated rules in both the citable skill
  and the live scanner: `faqhub-rendering-gap`, `template-placeholders-visible`
- Real hero motion — per-character 3D shatter, matrix decode, SVG turbulence
- Every page has canonical + BreadcrumbList JSON-LD
- Tap-to-call alongside tap-to-text everywhere
- Own site scores **88/100** on the checker (no caps)

### Open / next
1. **Anthropic billing top-up** — Daniel's action. Widget returns `billing`
   error now, so we know it's not a key or a model ID problem.
2. **Hero transitions** — rated 6/10. Room for another pass if the current
   motion still doesn't land. Watch it live first.
3. **Neighbourhood pages** for local SEO (Astoria, Ridgewood, Flushing,
   Jamaica). Daniel said "not yet" — wants them done properly, not as thin
   duplicates.
4. **New trade demos** (plumbing, electrical, landscaping) — deferred.
5. `work.html` is `noindex`, so the portfolio brings zero search traffic.
   Daniel chose this knowingly. Revisit only if he raises it.
6. Checker scores Daniel's own site 80 in the "calls" group because his
   homepage has no `<form>` — intentional, funnel is SMS-first.

### Ratings history (never infer a rating he didn't give)
- Pest demo photo icons — 7.5
- Six new pages + nav + deposit rollout — 8
- Harsher scanner scoring + llms.txt — 7
- HANDOFF v1 — 7
- Hero pacing + auto image + first transitions — no rating recorded
- Real hero motion (v2) — 6
- Rotorooter audit findings automated — awaiting rating at time of writing

---

## 8. How Daniel wants to be worked with

Pulled from his global instructions. Not optional.

- **ADHD.** The bottleneck is starting and doing, never ideas.
- **Brief and blunt.** Lead with the answer or the ONE next action. No preamble.
- **Decide, don't offer menus.** Pick a sensible default and go.
- **One action at a time for HIS steps.** Never dump a checklist — one tiny
  physical step, wait, then the next. Only for his steps; your own work
  should be delivered finished.
- **When building: build the whole thing, don't narrate.** He reviews and
  says what to fix.
- **RSD.** Criticism lands hard. Be warm, specific, solution-focused. Pair
  every problem with the next fix. Never blame.
- **Eat the grind.** Admin, setup, drafting, holding the plan — your job.
- **Don't volunteer concerns or caveats about his choices.** Execute.
  Exceptions: a safety issue, a plain factual correction, or a genuine
  blocker — state it in one line, then keep building.
- **Send files, don't describe them.** He cannot see files left on disk.
  Use SendUserFile for every deliverable.
- After a skill-routed deliverable: `record_outcome`, then ask for a 1–10
  rating on its own bolded line, then `record_rating`. Never infer.

### Honesty rules baked into this site — keep them

The site makes **no guarantees** about rankings, lead volume or revenue. Every
statistic on `why.html` is sourced. The demos are disclosed as fictional. The
FTC prohibits fake reviews; New York requires real licence numbers in
advertising — that liability lands on the client, not on Daniel.

**Do not add a guarantee, a payback period, or an invented testimonial to any
page, even if asked to make the copy stronger.** Offer a truthful alternative
instead.
