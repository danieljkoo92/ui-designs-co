# UI Designs Co — Handoff

**Written:** 2026-09-19 (replaces the 2026-08-28 version)
**Purpose:** paste this into a new chat so it can pick up without re-deriving anything.
**Read this before any other doc in this repo. The repo outranks this file** —
if they disagree, check the code and `git log`, then fix this file.

---

## 1. What this is

Daniel's own business site. He sells custom websites to local NYC businesses
(trades, salons, auto body, etc.) out of Queens. One-person operation, **no
coding background** — explain plainly, never hand him a wall of steps.

- **Repo:** `C:\Users\winst\Documents\INSURANCE agent results\ui-designs-co`
- **Remote:** https://github.com/danieljkoo92/ui-designs-co.git (branch `main`)
- **Live:** https://ui-designs-co.vercel.app
- **Deploy:** push to `main` → Vercel auto-deploys in ~20 s. No build step.
  Static files + serverless functions in `api/` (`scan.js`, `chat.js`,
  `lead.js`, shared `_robots.js`).

### The offer (appears in ~8 files — grep before changing any number)

| Thing | Price | Notes |
|---|---|---|
| Free preview | $0 | Working site within 48 h, no obligation |
| Revision deposit | $200 | Before any revision work. Non-refundable once the revised preview is delivered. Credited toward the build |
| Standard build | $1,000 one-time | Live 5–7 days, 2 full redesigns after purchase |
| **Signature build** | **$3,500 one-time** | **$500 deposit, non-refundable, credited → $3,000 at launch.** Live 10–14 days. Scoped by text, no speculative preview |
| Plans | $149 / $349 / $697 per month | Optional, only after a build |
| AI phone agent | price on request | Never quote a number |

The $500 figure and "non-refundable" were set on 2026-09-19 and are live in
`terms.html` (§3 + §10), `faq.html` (answer + schema), `how-it-works.html`,
`api/chat.js`, `CLIENT-AGREEMENT.md`. Hosting is included forever, with or
without a plan. The domain is registered in the client's name (~$15/yr, they pay).

---

## 2. Pages & portfolio

| File | What | Indexed |
|---|---|---|
| `index.html` | Homepage. Own inline styles + `hero.js` (GSAP film). Pricing, work grid (8 cards), FAQ + schema, lead form | yes |
| `work.html` | Portfolio: **9 builds across 8 trades** (pest control appears twice) | noindex |
| `plans.html`, `why.html`, `how-it-works.html`, `about.html`, `faq.html` (25 Q&As + FAQPage schema), `book.html` (consult form), `scan.html` | Marketing pages, use `site.css` | yes |
| `terms.html`, `privacy.html`, `accessibility.html` | Legal, use `legal.css` | yes |
| `404.html` | Custom 404, root-absolute links | noindex |
| `demo-*.html` (8) | Fictional-business demos, "Demo — fictional business" badge | noindex + robots Disallow |

**Every demo is fictional, including the tattoo studio.** Never call any of
them a client. Daniel was explicit: *there are no live client sites yet.*

### Signature demos (the premium tier's proof)

| Demo | URL | Showpiece |
|---|---|---|
| Tattoo studio | wahlahlahlahstudios.vercel.app (separate project) | Scroll film opening. Leads every grid |
| **Vesper Hair Studio** | `demo-hair.html` (new 2026-09-18) | Hover a client → her chair **spins** from the mirror to face you, hair finished. Plus 2 before/after crossfades, scroll push-in hero, 6 FAQs with schema. **AEO 100** on the scanner |
| Ironside Collision | `demo-auto.html` | Hero rebuilt 2026-09-18: scroll → Mercedes comes apart → engine glows red → clears → reassembles (same clip reversed). Wreck-to-fixed repair section below it |
| PestFree | `demo-pest-pro.html` | Pest-scatter scroll video |

Standard demos: `demo-pest`, `demo-hvac`, `demo-tree`, `demo-moving`, `demo-driving`.

**Adding a demo means touching:** `work.html` (card + counts in title/meta/og/h1),
`index.html` (work grid + heading count + Signature bullet links),
`api/chat.js` (demo list + count), `robots.txt` (Disallow), then
`node tools/gen-sitemap.mjs`. Also make `img/shots/<name>.jpg` (1200×800
screenshot of the page top) and `img/og/<name>.jpg` (1200×630).

---

## 3. The scroll-video pattern (both Signature heroes use it)

Copy `demo-auto.html` — it has every fix below baked in.

- **Encode all-intra** so scrubbing backwards doesn't stutter:
  `ffmpeg -i in.mp4 -an -vf scale=1280:-2 -c:v libx264 -crf 24 -g 1 -pix_fmt yuv420p -movflags +faststart out.mp4`
  (+ a 720w `-m.mp4` for phones, + a poster JPG).
- **Create the hero pin before the `.reveal` triggers.** Pins must be made in
  page order or everything below measures early (Ironside was 2,340 px off).
- `history.scrollRestoration = 'manual'` + `scrollTo(0,0)`, and
  `ScrollTrigger.refresh()` on video `canplaythrough` and window `load`.
- GSAP tags carry `defer`; the inline script runs inside `DOMContentLoaded`.
- Reverse playback on hover (Vesper spin): browsers can't play backwards, so
  step `currentTime` toward the target every animation frame. See `setSpin()`.
- Phones: stage above the copy, not behind it. Reduced motion: still image, no pin.

### Higgsfield (AI images/video)

- Connected over MCP — Claude generates directly. **Balance: ~2.14 credits.**
  A 5 s Kling 3.0 clip is 7.50 (std) / 8.75 (pro). GPT Image 2.5 is 1 credit
  (1.5 at 2K) — the same engine as ChatGPT, good for edits.
- **Always price with `get_cost:true` and show the shot list before spending.**
- Start/end-frame video only works when both frames share the room, angle and
  light. Crop both to the output aspect yourself (Kling does 16:9, 9:16, 1:1).
- Moving text turns to gibberish — never ask a video model for readable text.
- Owed: Vesper's hero is a photo push-in, not a video, because credits ran
  out. A real walk-through clip is 7.50 once Daniel tops up.

---

## 4. The site checker (`api/scan.js` + `scan-widget.js`)

Daniel's sales tool. Paste a URL → deterministic score, no AI, no cost.

- **38 checks**, 4 groups, plus three sub-scores: SEO / AEO / GEO.
- Deliberately harsh: weakest-link blend, −1.5 per failed check, hard caps
  (noindex → 0, AI crawlers blocked → 25, client-rendered → 35, no viewport → 40,
  no https / placeholders → 45, no phone → 50, no title → 55, no LocalBusiness → 65).
  **Daniel's rule: thresholds are set on merit. Never tune them to hit an example number he mentions.**
- **Customers see the top 3 checks per group; the rest are blurred.**
  **Daniel's own full view: `scan.html?full`.** It's a client-side blur, so it's
  not secure; a server-side gate is a possible upgrade.
- **Hidden-on-purpose:** a noindexed page returns `hidden:true` plus
  `visibleScore`, and the widget says so instead of "needs rebuilding".
- Security (don't weaken): SSRF-hardened (DNS + every redirect hop
  re-validated), 8 s timeout, 2 MB cap, 8/min rate limit, HTML never echoed.
- `node test/scan.test.js` → **13 checks, all pass.**
- Own site: **100/100** (SEO/AEO/GEO all 100) as of 2026-09-19.
- Known limit: sites behind Cloudflare bot protection (e.g. newmetro.club)
  403 the scanner's datacenter IP. The site isn't broken — its firewall
  rejects bots. Idea not built: say that instead of a generic error.

---

## 5. The chatbot (`api/chat.js` + `chat-widget.js`)

**Live and answering as of 2026-09-19.** It had been returning
`{"error":"billing"}` (the Anthropic account was out of credit); Daniel topped up.

- Model `claude-haiku-4-5-20251001`. The system prompt is sent as a cacheable
  block. Chat logs in Vercel include `usage`, so you can confirm cache hits
  from `cache_read_input_tokens`.
- Rate limited 20/min per IP. Errors are categorised (`config`, `auth`, `rate`,
  `billing`, `upstream`). On any failure the widget shows "Text Daniel" plus a
  one-tap SMS button.
- The prompt carries the offer, a page map, a MONEY AND PAPERWORK block (the
  published refund/domain/hosting/contract answers), a WHAT YOU DO NOT KNOW
  list (ADA/legal, migration, multilingual, logos, SEO outcomes → text Daniel),
  "don't be pushy" rules (ask for the phone number once), and the Signature
  pitch. **It must say every demo is fictional.**
- It's a template literal: after any edit, run `node -e "require('./api/chat.js')"`.

`api/lead.js` emails leads via Resend and returns `emailed:true/false`; forms
only promise a callback when the email actually sent.

---

## 6. Launch-readiness audit (Daniel's 20 items, started 2026-09-09)

**Done:** 1 privacy · 2 terms · 3 CTA above the fold (was already fine; the fix
was the mobile Call pill covering the footer legal links — a CSS cascade-order
bug) · 4 FAQ · 5 robots · 6 sitemap (now generated by
`tools/gen-sitemap.mjs` from robots + canonicals + git dates) · 7 custom 404 ·
8 alt text · 12 OG/Twitter tags + real 1200×630 images on every page, and
robots lets link-preview bots through so demo links unfurl · 13 favicons ·
14 canonicals · 16 mobile 375 px · 19 links.

**Still open:**
- **9 Analytics** — nothing installed. Recommended Vercel Web Analytics
  (cookieless, no banner, one tag). **Needs Daniel's yes.** `privacy.html`
  currently says there's no analytics, so update that sentence when adding it.
- 15 Cookie banner — not needed unless analytics with cookies goes in.
- 10/11 Meta lengths — `book.html` description is 165 chars (truncates in cards); 6 demo titles are 63–76.
- 17 A11y — `plans.html` skips h2→h4; the chat widget's text input has no label.
- 18 Forms — confirm `RESEND_API_KEY` is set in Vercel, or leads silently fail.
- 20 Perf — `demo-pest-pro.html` still loads GSAP without `defer`.

---

## 7. Open decisions / waiting on Daniel

1. **Custom domain.** Recommended `uidesignsco.com` ($11.25/yr via Vercel,
   available 2026-09-12). Not known to be bought. **Do it before Google Search
   Console.** Moving means updating canonicals, og:url, the sitemap and robots,
   and adding a redirect.
2. **Google Search Console** — submit the sitemap, but after the domain is settled.
3. **Analytics** (above).
4. **Attorney review** of `CLIENT-AGREEMENT.md` (still a draft) — include the
   non-refundable $500 Signature deposit clause.
5. **Checkmate app themes** — separate repo (`C:\Users\winst\Documents\check-mate`).
   Daniel asked for 5 themes, each with its own font: **Sleek, Casual,
   Efficient, Minimal, + a girly one (he wants it named)**, from his 4 mockup
   screenshots. Not started: the session moved on. The existing code has
   `ThemeChoice` (midnight/ocean/paper/blossom/sunset) in `app/lib/theme/palettes.dart`
   and a separate `AppFont` enum in `app_fonts.dart`. The plan is to rename the
   themes and bind one font per theme. **That repo has a large uncommitted tree
   — read `git status` first.**

---

## 8. How to work here

```bash
node -e "require('./api/chat.js'); require('./api/scan.js'); console.log('ok')"
node test/scan.test.js
npx -y http-server -p 8898 -a 127.0.0.1 -c-1   # needs Range support; NOT python -m http.server
node tools/gen-sitemap.mjs                      # after adding/removing pages
```

Deploy check: push, then poll `curl … | grep -q "<new text>"`. Also poll the
new **images**, not just the HTML — Vercel spreads files over a few seconds and
a too-early load shows 404s.

### Traps that cost real time

- **Python strings eat backslashes.** `\b` written through a non-raw Python
  string becomes a backspace character. It broke the `?full` regex once. Use
  raw strings or avoid `\b`.
- **CSS order beats intent.** A mobile `padding-bottom` placed before the base
  `padding:44px 0` shorthand was silently dead. Test the served stylesheet,
  not a rule injected at runtime.
- **The Playwright MCP drives Daniel's real Chrome.** His tabs are open in it —
  never close them. Background tabs throttle to ~1 frame/sec, so animations
  look jerky there. Test logic with timings, not smoothness. The in-app
  Browser pane pauses animation entirely while hidden.
- An old `http-server` may still hold port 8898 (TaskStop doesn't always kill
  the node child). It serves the same folder, so that's harmless.
- Three style systems: `site.css`, `index.html` inline, `legal.css`. The nav
  is duplicated across pages, so edit them with a script.
- CRLF warnings on commit are normal.

---

## 9. How Daniel wants to be worked with

- **ADHD:** lead with the answer or ONE next action. Short, blunt, scannable.
- **Decide, don't offer menus.** For his steps: one tiny physical step, then
  wait. Your own work gets delivered finished.
- **RSD:** warm, specific, solution-first. No blame.
- **Visual check before showing him anything.** Send files with SendUserFile —
  he can't see files left on disk.
- No drawn/SVG placeholder images; photographic only. Run the ui-ux-pro-max
  pass before building a site. Run stop-slop on copy.
- Honesty rules: no guarantees, payback periods or invented testimonials. Demos
  are disclosed as fictional. Never claim a live client.
- After a skill-routed deliverable: `record_outcome` → a bolded
  **Rate this 1-10 (halves ok):** line → `record_rating` with his exact number
  only. **He gave no ratings this session.** Don't infer any.
