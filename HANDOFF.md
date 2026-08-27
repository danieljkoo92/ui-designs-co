# UI Designs Co — Handoff

**Written:** 2026-08-27
**Purpose:** hand this to a fresh chat so it can pick up without re-deriving anything.
**Read this before the README or any other doc in this repo.**

---

## 1. What this is

Daniel's own business website. He sells custom websites to local trade businesses
(contractors, auto body, pest control, movers, HVAC, tree services, driving schools)
out of Queens, NY. He is a one-person operation with no coding background — explain
things plainly and never hand him a wall of steps.

- **Repo:** `C:\Users\winst\Documents\INSURANCE agent results\ui-designs-co`
- **Git remote:** https://github.com/danieljkoo92/ui-designs-co.git (branch `main`)
- **Live:** https://ui-designs-co.vercel.app
- **Deploy:** push to `main`, Vercel auto-deploys. Takes roughly 1–4 minutes.
  No build step — static files plus two serverless functions in `api/`.

### The offer being sold (it appears in 6+ files — memorize it)

| Thing | Price | Notes |
|---|---|---|
| Free preview | $0 | Real working site within 48h, before any payment, no obligation |
| **Revision deposit** | **$200** | Due before ANY revision work. **Credited toward the build.** |
| Standard build | $1,000 one-time | Live 5–7 days. 2 full redesigns included *after purchase* |
| Signature build | $3,500 one-time | Scroll-driven film / 3D. Live 10–14 days |
| Starter plan | $149/mo | Optional, only after a build |
| Grow plan | $349/mo | "Most picked" |
| Dominate plan | $697/mo | |
| AI phone agent | price on request | Never quote a number for this |

**The $200 deposit is recent and replaced an older "$100 design-direction fee."**
If you find `$100` or "first 2 edits free" anywhere, it is stale copy — fix it.
It currently reads correctly in `index.html`, `api/chat.js`, `terms.html`,
`CLIENT-AGREEMENT.md`, `how-it-works.html`, `faq.html`, `about.html`, `llms.txt`.

---

## 2. File map

### Pages (all live)

| File | What it is | Indexed? |
|---|---|---|
| `index.html` | Homepage. Long scroll, cinematic video hero. All styles inline. 47KB | yes |
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
**This was Daniel's explicit decision.** The demos carry invented business names,
licence numbers and reviews, so they must never be mistaken for real companies.
Do not "helpfully" index them.

### Shared assets

- `site.css` — the shell (tokens, header, nav, footer, buttons) for the 7 new pages.
  **`index.html` does NOT use it** — the homepage keeps its own inline `<style>`.
  Change a token in one and you must change it in the other.
- `site.js` — mobile nav toggle + IntersectionObserver scroll reveals.
- `scan-widget.css` / `scan-widget.js` — the checker UI. Self-contained; mounts into
  any `<div data-site-check>`. Used on `index.html`, `why.html`, `scan.html`.
- `chat-widget.js` — the chat bubble. Self-contained, styles included, no CSS file.
- `llms.txt` — plain-language summary of the business for AI tools.

### Design tokens (identical in `site.css` and `index.html`)

```
--void:#0A0C10   --panel:#12161D  --edge:#232A35
--steel:#8C97A6  --white:#F2F5F9  --gold:#D9A441  --gold-dark:#B8862C
```

Headings are Playfair Display (Google Fonts); body is the system font stack.

---

## 3. The site checker (`api/scan.js` + `scan-widget.js`)

Daniel's best sales tool. A visitor pastes their URL, the server fetches that page and
scores it 0–100. **No AI is involved** — every check is deterministic, so it costs
nothing per scan and cannot hallucinate a finding.

### 20 checks in 4 groups

- **found** (25% of score) — title (needs 30+ chars), meta description (70+), exactly
  one H1, `/sitemap.xml`, `/robots.txt`, Open Graph tags, image alt text
- **phone** (20%) — viewport meta, https, HTML weight (under 400KB), response (under 900ms)
- **calls** (25%) — `tel:` link, phone number in text, a `<form>`, address/service area
- **ai** (30%) — LocalBusiness JSON-LD (weight 4, heaviest single check), opening hours,
  FAQ content, service area stated in words, `/llms.txt`

### Scoring is deliberately harsh — this was a specific requested fix

Daniel's words: *"the start with your own site section is ranking everything too high."*

The fix was three things: weight the groups (above), tighten thresholds, and add
**caps** — a critical failure sets a ceiling the rest of the score cannot climb past:

```
no viewport               -> max 40
no https                  -> max 45
no phone number anywhere  -> max 50
no page title             -> max 55
no LocalBusiness JSON-LD  -> max 65
```

Calibration verified live — **keep these as regression anchors**:

| Site | Score |
|---|---|
| example.com (blank page) | 27 |
| homedepot.com | 45 |
| mrrooter.com | 65 |
| rotorooter.com | 65 |
| **ui-designs-co.vercel.app** | **91** |

If a change makes a national plumbing chain score 80+, the scoring has drifted back to
being flattering. Re-check against this table.

### Security — do not weaken

`api/scan.js` fetches an arbitrary user-supplied URL, so it is SSRF-hardened:

- DNS-resolves the host and **rejects private, loopback, link-local (169.254.x, the
  cloud metadata range), CGNAT and multicast addresses** — IPv4 and IPv6, including
  IPv4-mapped IPv6 forms
- Non-http(s) schemes rejected instantly, before any DNS lookup
- Redirects handled manually, max 3, and **every hop is re-validated**
- 8s timeout, 2MB response cap, ports restricted to 80/443/8080
- Rate limit 8/min per IP
- **The fetched HTML is never echoed back to the browser** — only findings

Known, accepted residual: a DNS-rebinding TOCTOU window between the validation lookup
and the fetch. It is documented in a comment. Acceptable for a marketing tool.

`RATE_LIMIT` is an in-memory `Map`, so it is per serverless instance, not global. It
stops casual hammering, not a determined attacker.

### Known limitation

It reads server-returned HTML only, so heavily JS-rendered sites under-score on content
checks. That is arguably honest (a JS-only page really is worse for crawlers) but be
ready to explain it rather than treat it as a bug.

**Fixed bug worth remembering:** it originally parsed only the first 200KB, so large
sites (Home Depot, Mr. Rooter) were wrongly reported as having "no page title." It now
scans the whole document.

---

## 4. The chatbot (`api/chat.js` + `chat-widget.js`) — CURRENTLY BROKEN

**`POST /api/chat` returns `{"error":"upstream"}` in production right now.**

`upstream` means the call to `api.anthropic.com` failed. The function reads
`ANTHROPIC_API_KEY` from Vercel env; the key never reaches the browser.

**Ruled out:** the model ID was `claude-sonnet-4-6`, which is not a real model. It was
corrected to `claude-haiku-4-5-20251001` — chosen over Sonnet because replies are 2–4
sentences off a tight prompt and it is far cheaper per conversation. (Swap to
`claude-sonnet-5` if objection handling ever needs more depth.) **The failure persisted
after that fix**, so the model ID was not the cause.

**Most likely cause: the Anthropic API key is missing, invalid, or the account has no
credit.** Earlier sessions noted the balance being empty. This is Daniel's to resolve —
it needs the Anthropic console and the Vercel dashboard.

Diagnosis is blocked from this machine: the Vercel MCP is signed into
`team_ZULOFT9Lv7rkCvA2Y0xVgqTI`, which has **zero projects** — the live site deploys
from a different Vercel account, so runtime logs cannot be read via MCP. The real
Anthropic error IS logged server-side (`console.error('anthropic error', ...)`) and is
visible in that account's Vercel runtime logs.

**Next step for Daniel — give him ONE of these at a time, never both at once:**
1. Open the Anthropic Console billing page and check the credit balance.
2. If there is credit: Vercel, then the project, then Settings, then Environment
   Variables — confirm `ANTHROPIC_API_KEY` exists on Production and is current.

**Not an emergency:** the widget degrades gracefully. `failSafe()` catches the error and
shows *"Text Daniel at 917-245-8685 and he'll answer directly."* A visitor gets a usable
fallback, not a broken box. But the bot is dead weight until the key is fixed.

### The system prompt

Long and prescriptive. It contains: the offer, a page map of all 7 pages so the bot can
link people, the site checker as a "second close" for visitors who already have a site,
the approved statistics list, four objection scripts, and hard rules against inventing
quotes, guarantees, payback periods or rankings.

**The bot closes by emitting `[SMS_BUTTON]...[/SMS_BUTTON]`**, which the widget turns
into a pre-filled tappable SMS link. It only does that once it has business name, trade
and phone number.

The widget linkifies page paths like `/scan.html` into tappable anchors, built from DOM
nodes against a fixed page whitelist — model output never touches `innerHTML`.

When editing the prompt: it is a template literal, so backticks and `${` must be
escaped. Always run `node -e "require('./api/chat.js')"` after editing.

---

## 5. How to work in this repo

### Verification loop that actually works

```bash
# 1. syntax-check the serverless functions after ANY edit
node -e "require('./api/chat.js'); require('./api/scan.js'); console.log('ok')"

# 2. serve locally — python -m http.server DOES NOT WORK
python <scratchpad>/rangeserve.py 8770 "<repo path>"
```

**`python -m http.server` has no HTTP Range support**, so Chrome refuses to seek the
scroll-driven demo videos and the pest/auto demos look broken. Always use a
range-capable server. If you need `/api/*` locally too, write a small Node server that
`require`s the handler directly — there is no `vercel dev` configured here.

Then drive it with Playwright at **1400×900 and 390×844**. Both matter — Daniel checks
on his phone.

### Deploy and verify

```bash
git add -A && git commit -m "..." && git push
# then poll until the change actually appears — never assume:
curl -s https://ui-designs-co.vercel.app/<page> | grep -q "<something new>"
```

### Gotchas

- **CRLF warnings on every commit are normal** on this Windows checkout. Ignore them.
- Three style systems: `site.css` (7 new pages), inline `<style>` (`index.html`),
  `legal.css` (3 legal pages). Keep tokens in sync by hand.
- The nav markup is duplicated across all 8 pages — there is no templating. A nav change
  means editing 8 files; a small scripted `python` pass is the sane way to do it.
- Playwright here is sometimes shared with another process — pages have navigated on
  their own and had text typed into them mid-run. If a screenshot looks wrong,
  re-navigate before concluding the page is broken.

---

## 6. Where things stand

### Done and live
- $200 deposit rolled out across the site, chatbot prompt, terms and client agreement
- 7 new pages, real top nav, footer nav on every page
- Working site checker: SSRF-hardened, harshly calibrated, llms.txt detection
- Tap-to-call alongside tap-to-text everywhere (closing CTAs and footers)
- The site now practices what it preaches — LocalBusiness JSON-LD, `llms.txt`, stated
  service area — taking its own score from 53 to 83 to **91/100**

### Open / next
1. **Chatbot API key** — blocked on Daniel (section 4). Highest-value fix available.
2. **Neighbourhood pages** for local SEO (Astoria, Ridgewood, Flushing, Jamaica).
   Daniel said "not yet" — he wants them done properly, not as thin duplicates.
3. **New trade demos** (plumbing, electrical, landscaping) — deferred, "ship pages first."
4. **`work.html` is noindex**, so the portfolio brings zero search traffic. Daniel chose
   this knowingly. Revisit only if he raises it.
5. The checker scores Daniel's own "calls" group 80 because there is no `<form>` on the
   homepage. Intentional — his funnel is SMS-first.

### Ratings history (he rates work 1–10; never infer one he did not give)
- Pest demo photo icons — 7.5
- Six new pages + nav + deposit rollout — 8
- Harsher scanner scoring + llms.txt — 7

---

## 7. How Daniel wants to be worked with

From his global instructions. These are not optional.

- **He has ADHD.** The bottleneck is starting and doing, never ideas.
- **Be brief and blunt.** Lead with the answer or the ONE next action. No preamble.
- **Decide, don't offer menus.** Pick a sensible default and go.
- **One action at a time for HIS steps.** Never dump a checklist on him — one tiny
  physical step, wait, then the next. This applies only to his steps, never to your own
  work, which should be delivered finished.
- **When building: build the whole thing, don't narrate.** He reviews and says what to fix.
- **He has RSD.** Criticism lands hard. Be warm, specific, solution-focused. Pair every
  problem with the next fix. Never blame.
- **Eat the grind.** Admin, setup, drafting, holding the plan — that is your job.
- **Don't volunteer concerns or caveats about his choices.** Execute. Exceptions: a safety
  issue, a plain factual correction, or a genuine blocker — state it in one line, then
  keep building.
- **Send files, don't describe them.** He cannot see files left on disk. Use SendUserFile
  for every deliverable.
- After a skill-routed deliverable: `record_outcome`, then ask for a 1–10 rating on its
  own bolded line, then `record_rating`. Never infer a rating he did not explicitly give.

### Honesty rules baked into this site — keep them

The site deliberately makes **no guarantees** about rankings, lead volume or revenue, and
every statistic on `why.html` is sourced. The demos are disclosed as fictional. The FTC
prohibits fake reviews and New York requires real licence numbers in advertising — and
that liability lands on the client, not on Daniel.

**Do not add a guarantee, a payback period, or an invented testimonial to any page, even
if asked to make the copy stronger.** Offer a truthful alternative instead.
