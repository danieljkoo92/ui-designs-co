// Vercel serverless function: POST /api/scan
// Fetches a visitor-supplied URL and scores it on the things that decide
// whether a local business gets found, gets called, and gets named by AI
// assistants. No AI calls — every check below is deterministic.

const dns = require('dns').promises;
const { AI_AGENTS, blockedAgents } = require('./_robots');

const FETCH_TIMEOUT_MS = 8000;
const SIDE_TIMEOUT_MS = 3500;
const MAX_BYTES = 2 * 1024 * 1024; // 2MB of HTML is already a failing grade
const MAX_REDIRECTS = 3;
const RATE_LIMIT = { windowMs: 60_000, max: 8 };

// Per-instance only — serverless spins up many instances, so this throttles
// the obvious hammering rather than providing a real global limit.
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > RATE_LIMIT.windowMs) {
    hits.set(ip, { start: now, n: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  rec.n += 1;
  return rec.n > RATE_LIMIT.max;
}

/** Blocks loopback, private, link-local, CGNAT and unique-local ranges. */
function isPrivateAddress(addr, family) {
  if (family === 6) {
    const a = addr.toLowerCase();
    if (a === '::1' || a === '::') return true;
    if (a.startsWith('fe80') || a.startsWith('fc') || a.startsWith('fd')) return true;
    // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1
    const m = a.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateAddress(m[1], 4);
    return false;
  }
  const p = addr.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;          // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true;                         // multicast / reserved
  return false;
}

async function assertPublicUrl(u) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http and https addresses can be checked.');
  }
  if (u.port && !['80', '443', '8080', ''].includes(u.port)) {
    throw new Error('That port is not allowed.');
  }
  let addrs;
  try {
    addrs = await dns.lookup(u.hostname, { all: true });
  } catch {
    throw new Error("That address doesn't resolve. Check the spelling.");
  }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address, a.family))) {
    throw new Error('That address is not reachable from the public internet.');
  }
}

/** Fetch with manual redirects so every hop is re-validated. */
async function safeFetch(startUrl, { method = 'GET', timeout = FETCH_TIMEOUT_MS } = {}) {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    let res;
    try {
      res = await fetch(url.href, {
        method,
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'user-agent': 'UIDesignsCo-SiteCheck/1.0 (+https://ui-designs-co.vercel.app)',
          accept: 'text/html,application/xhtml+xml'
        }
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url);
      continue;
    }
    return { res, finalUrl: url };
  }
  throw new Error('That site redirects too many times.');
}

async function readCapped(res) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return { text: await res.text(), bytes: 0, truncated: false };
  const chunks = [];
  let bytes = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > MAX_BYTES) { truncated = true; reader.cancel(); break; }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString('utf8'), bytes, truncated };
}

// A 200 is not proof the file is there. Plenty of hosts answer every unknown
// path with an HTML error page, which would otherwise let us tell someone they
// have a sitemap when they do not. Nothing here should ever be HTML.
async function exists(base, path) {
  try {
    const { res } = await safeFetch(new URL(path, base), { timeout: SIDE_TIMEOUT_MS });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') || '';
    return !/text\/html|application\/xhtml/i.test(type);
  } catch {
    return false;
  }
}

// robots.txt has to be read, not just counted — its contents decide whether the
// AI crawlers can see the site at all. Capped hard: no robots.txt needs 256KB.
async function fetchRobots(base) {
  try {
    const { res } = await safeFetch(new URL('/robots.txt', base), { timeout: SIDE_TIMEOUT_MS });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    // A SPA host that answers every path with index.html would otherwise have
    // its HTML parsed as robots directives.
    if (type && !/text\/plain/i.test(type)) return null;
    const body = await res.text();
    return body.length > 256 * 1024 ? body.slice(0, 256 * 1024) : body;
  } catch {
    return null;
  }
}

// Walk a JSON-LD graph and return every FAQPage's {q, a} entries. Used by
// the "answers rendered where schema claims" check below.
function extractFaqEntities(jsonld) {
  const out = [];
  const seen = new WeakSet();
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const t = node['@type'];
    const isFaq = Array.isArray(t) ? t.some((x) => /FAQPage/i.test(x)) : /FAQPage/i.test(t || '');
    if (isFaq && Array.isArray(node.mainEntity)) {
      for (const q of node.mainEntity) {
        const question = String((q && (q.name || q.text)) || '').trim();
        const acc = q && q.acceptedAnswer;
        const answer = String((acc && (acc.text || acc.name)) || '').trim();
        if (question) out.push({ q: question, a: answer });
      }
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(jsonld);
  return out;
}

function analyse(html, finalUrl, meta) {
  // Search the whole document, not a leading slice — big sites push <title>
  // and their meta tags past 200KB of inline script before the head closes.
  const head = html;
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                   .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                   .replace(/<[^>]+>/g, ' ');

  const title = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const desc = (head.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
                head.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i) || [])[1];
  const h1s = html.match(/<h1[\s>]/gi) || [];
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(head);
  const ogTitle = /property=["']og:(title|image)["']/i.test(head);

  // structured data
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]).join(' ');
  const hasLocalBiz = /"@type"\s*:\s*"?[^"]*(LocalBusiness|Plumber|Electrician|HVACBusiness|HomeAndConstructionBusiness|GeneralContractor|Roofing|MovingCompany|AutoRepair|PestControl|ProfessionalService|Store)/i.test(ld);
  const hasFaqSchema = /"@type"\s*:\s*"?FAQPage/i.test(ld);
  const hasOpeningHours = /openingHours/i.test(ld);
  const hasBreadcrumb = /"@type"\s*:\s*"?BreadcrumbList/i.test(ld);

  // meta robots noindex — the "please don't rank me" flag, usually left on
  // from a staging site by accident. Also honor X-Robots-Tag if the server sent one.
  const metaRobots = (head.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '';
  const xRobots = String(meta.xRobotsTag || '');
  const noindex = /\bnoindex\b/i.test(metaRobots) || /\bnoindex\b/i.test(xRobots);

  // canonical URL — the tag that tells search engines which URL of a page
  // is the real one, so duplicates don't fight for the same ranking.
  const canonicalUrl = (head.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
                        head.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i) || [])[1] || '';

  // html lang attribute — screen readers use it, and Google uses it as a
  // language hint. Trivial to add, common to miss.
  const hasLang = /<html\b[^>]*\blang\s*=\s*["'][a-zA-Z][^"']*["']/i.test(head);

  // getting called
  const telLink = /href=["']tel:/i.test(html);
  const phoneInText = /(\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b)/.test(text);
  const hasForm = /<form[\s>]/i.test(html);
  const addressish = /\b\d{1,5}\s+[A-Za-z][A-Za-z.\s]{2,30}\b(street|st\.?|ave|avenue|road|rd\.?|blvd|boulevard|lane|ln\.?|drive|dr\.?|way|place|pl\.?)\b/i.test(text)
                     || /\b\d{5}(-\d{4})?\b/.test(text);
  const serviceArea = /\b(serving|service area|we serve|areas we serve|proudly serving)\b/i.test(text);
  const faqWording = /\b(frequently asked|faq|common questions)\b/i.test(text);

  // Parsed JSON-LD blocks (as objects) — needed for the FAQ rendering-gap check
  // below. Reads block-by-block so a single malformed script doesn't drop the
  // rest.
  const jsonldParsed = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { jsonldParsed.push(JSON.parse(m[1].trim())); } catch { /* ignore */ }
  }
  const faqEntries = extractFaqEntities(jsonldParsed);

  // Q&A is fully rendered only when BOTH the question is a visible heading
  // AND the answer text is in the body. Same rule as the citable skill.
  const headingTextsLc = [...html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean);
  const bodyLc = text.toLowerCase();
  const faqRendered = faqEntries.filter((f) => {
    const qKey = f.q.toLowerCase().split(/\s+/).slice(0, 5).join(' ');
    const qShown = qKey.length >= 6 && headingTextsLc.some((h) => h.includes(qKey));
    const aShown = f.a.length >= 30 && bodyLc.includes(f.a.toLowerCase().slice(0, 40));
    return qShown && aShown;
  }).length;
  const faqHubGap = faqEntries.length >= 4 && (faqRendered / faqEntries.length) < 0.6;

  // Unreplaced template placeholders in the visible text — the classic
  // city-template bug: {{city}}, [LOCATION], %CITY_NAME%, ${area}. Requires
  // 3+ chars inside so plain prose like [1] or {x} does not false-positive.
  const PLACEHOLDER_RE = /(\{\{\s*[\w\-.\|:]{2,40}\s*\}\}|\[[A-Z_]{3,40}\]|%[A-Z_]{3,40}%|\$\{\s*[\w\-.]{2,40}\s*\})/g;
  const placeholderHits = text.match(PLACEHOLDER_RE) || [];
  const placeholderUniq = [...new Set(placeholderHits)];

  // images without alt
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const imgsNoAlt = imgs.filter((t) => !/\balt\s*=/i.test(t)).length;

  const https = finalUrl.protocol === 'https:';
  const weightKb = Math.round(meta.bytes / 1024);
  const ms = meta.ms;

  // --- the two things that decide whether an AI assistant can see the site ---

  // 1. Can the AI crawlers fetch it at all. Usually blocked by accident: a
  //    wildcard Disallow, a host's "block AI scrapers" toggle, a plugin default.
  const blockedAi = blockedAgents(meta.robotsBody, finalUrl.pathname, AI_AGENTS);

  // 2. Does the content exist before JavaScript runs. Google renders; most
  //    answer engines do not, so a client-rendered page can rank well and still
  //    be invisible to every assistant.
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
  const frameworkRoot = /__NEXT_DATA__|id=["']root["']|id=["']__nuxt["']|ng-version|data-reactroot|id=["']app["']/i.test(html);
  const serverRendered = words >= 400 || !frameworkRoot;
  const clientRendered = frameworkRoot && words < 150;

  // What an assistant can actually quote: numbers, prices, timeframes.
  // Adjectives are unquotable — nothing cites "premium quality service".
  const factTokens = (text.match(
    /\$\s?\d[\d,]*|\b\d[\d,]*(?:\.\d+)?\s?(?:%|percent|years?|months?|weeks?|days?|hours?|hrs?|minutes?|mins?|miles?|ft|feet|gallons?|lbs?|degrees?)|\b(?:19|20)\d{2}\b|\b\d[\d,]{2,}\b/gi
  ) || []).length;
  const factsPer500 = words >= 200 ? (factTokens / words) * 500 : null;

  // Headings shaped like the questions people type are what gets extracted.
  const headingTexts = [...html.matchAll(/<h[2-3]\b[^>]*>([\s\S]*?)<\/h[2-3]>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const questionHeadings = headingTexts.filter((t) =>
    /\?$/.test(t) || /^(how|what|why|when|where|who|can|do|does|is|are|should|will)\b/i.test(t)).length;
  const questionRatio = headingTexts.length >= 3 ? questionHeadings / headingTexts.length : null;

  const groups = [
    {
      key: 'found',
      label: 'Getting found on Google',
      blurb: 'The basics a search engine reads before it decides where to put you.',
      checks: [
        { label: 'Page title', pass: !!title && title.trim().length >= 30, weight: 3,
          good: `"${title ? title.trim().slice(0, 70) : ''}"`,
          bad: title ? `"${title.trim().slice(0, 40)}" — too short to say what you do and where you do it.` : 'This page has no title tag at all.' },
        { label: 'Description for search results', pass: !!desc && desc.trim().length >= 70, weight: 2,
          good: 'Present, and long enough to be useful.',
          bad: desc ? 'Too short — Google will ignore it and invent its own snippet.' : 'Missing, so Google writes your search listing for you.' },
        { label: 'One clear main heading', pass: h1s.length === 1, weight: 2,
          good: 'Exactly one main heading.',
          bad: h1s.length === 0 ? 'No main heading on the page.' : `${h1s.length} competing main headings.` },
        { label: 'Sitemap', pass: meta.sitemap, weight: 1,
          good: 'Found at /sitemap.xml.', bad: 'None found — search engines have to guess your pages.' },
        { label: 'Robots file', pass: meta.robots, weight: 1,
          good: 'Found at /robots.txt.', bad: 'None found.' },
        { label: 'Social preview', pass: ogTitle, weight: 1,
          good: 'Your link previews properly when shared.',
          bad: 'Shared links show a blank box instead of a preview.' },
        { label: 'Image descriptions', pass: imgs.length === 0 || imgsNoAlt / imgs.length < 0.3, weight: 1,
          good: 'Most images are described.',
          bad: `${imgsNoAlt} of ${imgs.length} images have no description — invisible to Google and to blind visitors.` },
        { label: 'Not set to "do not index"', pass: !noindex, weight: 5,
          good: 'Search engines are allowed to list this page.',
          bad: 'This page has a "noindex" instruction on it — you are actively telling Google to keep it out of results. Usually left on by mistake from a staging site or a plugin default. Nothing else on the checklist matters until this is off.' },
        { label: 'Canonical URL', pass: !!canonicalUrl, weight: 2,
          good: `Points to ${canonicalUrl.slice(0, 60)}${canonicalUrl.length > 60 ? '…' : ''} — search engines know which URL is the real one.`,
          bad: 'No canonical tag. If the same page is reachable at more than one address, search engines have to guess which one to rank, and split the credit between them.' },
        { label: 'Language declared', pass: hasLang, weight: 1,
          good: 'The page tells screen readers and Google what language it is in.',
          bad: 'No lang attribute on the html tag. Add lang="en" — a one-line fix that helps accessibility tools and search engines.' },
        { label: 'Enough content to rank', pass: words >= 300, weight: 2,
          good: `${words} words on the page — plenty for search engines to work with.`,
          bad: `Only ${words} words on the page. Search engines struggle to rank very thin pages — a service page needs roughly 300+ words describing what you do, where, and how.` }
      ]
    },
    {
      key: 'phone',
      label: 'Working on a phone',
      blurb: 'About 70% of home-service searches happen on a phone.',
      checks: [
        { label: 'Built for phone screens', pass: viewport, weight: 3,
          good: 'Scales to the screen properly.',
          bad: 'No mobile setup — phone users get a desktop page pinched down to thumbnail size.' },
        { label: 'Secure (https)', pass: https, weight: 3,
          good: 'Served securely.',
          bad: 'Not secure — browsers show visitors a "Not secure" warning next to your name.' },
        { label: 'Page weight', pass: weightKb < 400, weight: 2,
          good: `${weightKb} KB of HTML.`,
          bad: `${weightKb} KB of HTML before a single image loads — heavy on a phone signal.` },
        { label: 'Response time', pass: ms < 900, weight: 2,
          good: `Answered in ${ms} ms.`,
          bad: `Took ${ms} ms just to answer, before anything renders. 53% of mobile visitors leave by three seconds.` }
      ]
    },
    {
      key: 'calls',
      label: 'Turning visitors into calls',
      blurb: 'Being found is worthless if the page does not make contact obvious.',
      checks: [
        { label: 'Tap-to-call link', pass: telLink, weight: 3,
          good: 'Your number is tappable.',
          bad: 'No tap-to-call. On a phone, a number they have to copy out is a number they do not dial.' },
        { label: 'Phone number visible', pass: phoneInText, weight: 3,
          good: 'A phone number appears on the page.',
          bad: 'No phone number found in the page text.' },
        { label: 'Contact or quote form', pass: hasForm, weight: 2,
          good: 'There is a form to fill in.',
          bad: 'No form — the only way to reach you is to call.' },
        { label: 'Address or service area', pass: addressish || serviceArea, weight: 2,
          good: 'Location or service area is stated.',
          bad: 'Neither an address nor a service area — local searchers cannot tell if you cover them.' }
      ]
    },
    {
      key: 'ai',
      label: 'Ready to be recommended by AI',
      blurb: 'What decides whether an assistant can name you when someone asks for a business like yours.',
      checks: [
        { label: 'AI assistants allowed to read the site', pass: blockedAi.length === 0, weight: 5,
          good: 'ChatGPT, Claude, Perplexity and the rest are all allowed to read this site.',
          bad: `Your robots.txt blocks ${blockedAi.join(', ')}. While that stands, those assistants cannot see this site at all — no amount of good content changes it. This is almost always switched on by accident, by a host setting or a plugin.` },
        { label: 'Readable without JavaScript', pass: serverRendered, weight: 4,
          good: 'The words are in the page itself, so anything reading it gets the content.',
          bad: clientRendered
            ? 'The page arrives almost empty and fills in with JavaScript. Google can still read it, but most AI assistants cannot run JavaScript — to them this page is blank.'
            : 'Only part of the content is in the page itself; the rest loads with JavaScript, which most AI assistants never run.' },
        { label: 'Breadcrumb trail machines can read', pass: hasBreadcrumb, weight: 1,
          good: 'BreadcrumbList schema on the page — search engines and AI tools know where this page sits in your site.',
          bad: 'No BreadcrumbList schema. It is what puts the "Home › Services › Drain Cleaning" trail under your listing in Google, and it helps AI assistants understand your site structure.' },
        { label: 'Business details a machine can read', pass: hasLocalBiz, weight: 4,
          good: 'Your business is labelled in a format assistants and search engines read directly.',
          bad: 'No machine-readable business details. Assistants have to guess who and where you are — so they usually name someone else.' },
        { label: 'Facts worth quoting', pass: factsPer500 === null || factsPer500 >= 3, weight: 2,
          good: 'There are real numbers on the page — prices, timings, specifics an assistant can repeat.',
          bad: 'Almost no concrete numbers on the page. Assistants quote facts, never adjectives, so there is nothing here for one to pass on.' },
        { label: 'Headings written as questions', pass: questionRatio === null || questionRatio >= 0.25, weight: 2,
          good: 'Your headings match the questions people actually ask.',
          bad: 'Your headings are labels rather than questions. "Services" answers nothing; "How much does it cost?" is what someone types and what an assistant looks for.' },
        { label: 'Opening hours published', pass: hasOpeningHours, weight: 2,
          good: 'Hours are published in a readable format.',
          bad: 'Hours are not published in a format a machine can quote.' },
        { label: 'Questions answered on the page', pass: hasFaqSchema || faqWording, weight: 2,
          good: 'You answer common questions.',
          bad: 'No question-and-answer content — nothing for an assistant to quote as an answer.' },
        { label: 'FAQ answers actually on the page', pass: !faqHubGap, weight: 3,
          good: faqEntries.length ? `All ${faqEntries.length} FAQ answers your schema promises are in the page.` : 'Nothing to check — there is no FAQ schema on this page.',
          bad: `Your FAQ schema promises ${faqEntries.length} answers but only ${faqRendered} are actually in the page — the rest are labels with no answer text a machine can read. That is a common pattern on FAQ hubs that load the answers with JavaScript. AI assistants see the labels and nothing to quote.` },
        { label: 'No template placeholders leaking through', pass: placeholderHits.length === 0, weight: 3,
          good: 'No unreplaced template variables in the page text.',
          bad: `Unreplaced template placeholder(s) on the page: ${placeholderUniq.slice(0, 3).join(', ')}${placeholderUniq.length > 3 ? ` +${placeholderUniq.length - 3} more` : ''}. This usually means a city or service template ran the substitution for other pages and skipped this one. Retrieval quotes the placeholder as if it were real content.` },
        { label: 'Service area stated in words', pass: serviceArea, weight: 2,
          good: 'You say where you work in plain sentences.',
          bad: 'Your service area is implied rather than stated, so it cannot be repeated back to someone.' },
        // Deliberately low weight: llms.txt is an emerging convention, and as of
        // 2026 the major AI crawlers mostly still read the HTML instead. Worth
        // having, not worth pretending it drives citations on its own.
        { label: 'llms.txt file', pass: meta.llms, weight: 1,
          good: 'Present — a plain summary of your business written for AI tools to read.',
          bad: 'None found. It is a newer convention that most sites skip, so having one is a cheap edge rather than a fix.' }
      ]
    }
  ];

  groups.forEach((g) => {
    let gg = 0, gt = 0;
    g.checks.forEach((c) => {
      gt += c.weight;
      if (c.pass) gg += c.weight;
      c.detail = c.pass ? c.good : c.bad;
      delete c.good; delete c.bad;
    });
    g.score = Math.round((gg / gt) * 100);
  });

  // Weighted by what actually costs a local business work, rather than a flat
  // average — otherwise easy wins like https quietly carry a failing site.
  const GROUP_WEIGHT = { found: 0.25, phone: 0.20, calls: 0.25, ai: 0.30 };
  let score = Math.round(groups.reduce((sum, g) => sum + g.score * GROUP_WEIGHT[g.key], 0));

  // A site can fail in ways no amount of passing elsewhere makes up for.
  // Each cap is a ceiling, not a deduction.
  const caps = [];
  if (blockedAi.length) caps.push([25, 'it blocks AI assistants from reading it']);
  if (clientRendered) caps.push([35, 'the page is empty until JavaScript runs, and assistants do not run it']);
  if (!viewport) caps.push([40, 'it is not built for phone screens']);
  if (!https) caps.push([45, 'it is not served securely']);
  if (!telLink && !phoneInText) caps.push([50, 'there is no phone number on it']);
  if (!title) caps.push([55, 'it has no page title']);
  if (!hasLocalBiz) caps.push([65, 'it has no machine-readable business details']);
  if (placeholderHits.length) caps.push([45, 'unreplaced template placeholders like {{city}} are visible on the page']);
  if (noindex) caps.push([0, 'the page has a "noindex" instruction telling Google to keep it out of search results']);
  caps.forEach((c) => { score = Math.min(score, c[0]); });

  const failed = groups.reduce((n, g) => n + g.checks.filter((c) => !c.pass).length, 0);
  return { score, groups, failed, caps: caps.map((c) => c[1]) };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    res.status(429).json({ error: 'Too many checks from this connection. Give it a minute.' });
    return;
  }

  try {
    let raw = (req.body && req.body.url ? String(req.body.url) : '').trim();
    if (!raw || raw.length > 300) {
      res.status(400).json({ error: 'Enter a website address.' });
      return;
    }
    // reject a non-web scheme outright rather than prefixing https:// onto it
    const scheme = raw.match(/^([a-z][a-z0-9+.\-]*):/i);
    if (scheme && !/^https?$/i.test(scheme[1])) {
      res.status(400).json({ error: 'Only http and https addresses can be checked.' });
      return;
    }
    if (!scheme) raw = 'https://' + raw;

    let url;
    try {
      url = new URL(raw);
    } catch {
      res.status(400).json({ error: "That doesn't look like a web address." });
      return;
    }

    const started = Date.now();
    let fetched;
    try {
      fetched = await safeFetch(url);
    } catch (e) {
      res.status(400).json({ error: e.message || "Couldn't reach that site." });
      return;
    }
    const ms = Date.now() - started;
    const { res: pageRes, finalUrl } = fetched;

    if (!pageRes.ok) {
      res.status(400).json({ error: `That site answered with an error (${pageRes.status}).` });
      return;
    }
    const type = pageRes.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(type)) {
      res.status(400).json({ error: 'That address is not a web page.' });
      return;
    }

    const { text: html, bytes } = await readCapped(pageRes);

    const [sitemap, robotsBody, llms] = await Promise.all([
      exists(finalUrl, '/sitemap.xml'),
      fetchRobots(finalUrl),
      exists(finalUrl, '/llms.txt')
    ]);

    const result = analyse(html, finalUrl, {
      bytes, ms, sitemap, llms, robotsBody, robots: robotsBody != null,
      xRobotsTag: pageRes.headers.get('x-robots-tag') || ''
    });

    // Only findings go back to the browser — never the fetched markup.
    res.status(200).json({
      url: finalUrl.origin + finalUrl.pathname,
      score: result.score,
      failed: result.failed,
      caps: result.caps,
      groups: result.groups
    });
  } catch (err) {
    console.error('scan error', err && err.message);
    res.status(500).json({ error: 'Something went wrong running that check.' });
  }
};
