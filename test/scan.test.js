// Run: node test/scan.test.js
// Covers the robots grammar the site check depends on, then drives the real
// /api/scan handler end to end against a live site.

const assert = require('assert/strict');
const { robotsVerdict, blockedAgents, AI_AGENTS } = require('../api/_robots');
const handler = require('../api/scan');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
}

// ------------------------------------------------------------ robots grammar

test('a wildcard disallow-all blocks every AI crawler', () => {
  assert.deepEqual(blockedAgents('User-agent: *\nDisallow: /', '/', AI_AGENTS), AI_AGENTS);
});

test('no robots.txt means allowed, not blocked', () => {
  assert.deepEqual(blockedAgents(null, '/', AI_AGENTS), []);
});

test('an empty Disallow allows everything', () => {
  assert.deepEqual(blockedAgents('User-agent: *\nDisallow:', '/', AI_AGENTS), []);
});

test('a named group beats the wildcard group', () => {
  const raw = 'User-agent: *\nDisallow:\n\nUser-agent: GPTBot\nDisallow: /';
  assert.deepEqual(blockedAgents(raw, '/', AI_AGENTS), ['GPTBot']);
});

test('a named Allow rescues a crawler from a wildcard block', () => {
  const raw = 'User-agent: *\nDisallow: /\n\nUser-agent: ClaudeBot\nAllow: /';
  const blocked = blockedAgents(raw, '/', AI_AGENTS);
  assert.ok(!blocked.includes('ClaudeBot'));
  assert.ok(blocked.includes('GPTBot'));
});

test('the longest matching rule wins', () => {
  const raw = 'User-agent: *\nDisallow: /blog\nAllow: /blog/public';
  assert.equal(robotsVerdict(raw, 'GPTBot', '/blog/public/post'), 'allow');
  assert.equal(robotsVerdict(raw, 'GPTBot', '/blog/private'), 'disallow');
});

test('consecutive user-agent lines share one group', () => {
  const raw = 'User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /';
  assert.deepEqual(blockedAgents(raw, '/', AI_AGENTS).sort(), ['CCBot', 'GPTBot']);
});

test('mentioning a bot in a comment does not block it', () => {
  const raw = '# we welcome GPTBot here\nUser-agent: *\nDisallow:';
  assert.deepEqual(blockedAgents(raw, '/', AI_AGENTS), []);
});

// -------------------------------------------------------------- handler e2e

function fakeRes() {
  return {
    code: null, body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }
  };
}

async function e2e() {
  const res = fakeRes();
  await handler(
    { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.9' }, body: { url: 'https://www.rotorooter.com/' } },
    res
  );

  assert.equal(res.code, 200, `expected 200, got ${res.code}: ${JSON.stringify(res.body)}`);
  const ai = res.body.groups.find((g) => g.key === 'ai');
  assert.ok(ai, 'the AI group should be present');

  const labels = ai.checks.map((c) => c.label);
  for (const needed of [
    'AI assistants allowed to read the site',
    'Readable without JavaScript',
    'Facts worth quoting',
    'Headings written as questions'
  ]) {
    assert.ok(labels.includes(needed), `missing check: ${needed}. got: ${labels.join(' | ')}`);
  }

  assert.ok(typeof res.body.score === 'number' && res.body.score >= 0 && res.body.score <= 100);
  assert.ok(ai.checks.every((c) => typeof c.detail === 'string' && c.detail.length > 0),
    'every check needs a plain-English detail line');
  assert.ok(!JSON.stringify(res.body).includes('<html'), 'fetched markup must never be returned');

  console.log(`\n  e2e: ${res.body.url}`);
  console.log(`  score ${res.body.score}/100, AI-readiness ${ai.score}/100, ${res.body.failed} failed check(s)`);
  if (res.body.caps.length) console.log(`  capped because ${res.body.caps.join('; ')}`);
  for (const c of ai.checks) console.log(`    ${c.pass ? 'PASS' : 'FAIL'}  ${c.label}`);
  passed++;
}

// Not covered here: the soft-404 guard in exists(), which rejects a 200 whose
// content-type is HTML. Hosts that answer every unknown path with an error page
// would otherwise be credited with a sitemap they do not have. It cannot be
// driven from this file — the SSRF guard correctly refuses to fetch a local
// fixture server, and no third-party site can be relied on to keep exhibiting
// the behaviour. Verified by reading exists().

async function rateLimit() {
  const res = fakeRes();
  for (let i = 0; i < 12; i++) {
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '198.51.100.7' }, body: { url: 'notaurl' } }, res);
  }
  assert.equal(res.code, 429, 'hammering one IP should hit the rate limit');
  passed++;
}

async function ssrf() {
  for (const bad of ['http://localhost/', 'http://127.0.0.1/', 'http://169.254.169.254/', 'file:///etc/passwd']) {
    const res = fakeRes();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.55' }, body: { url: bad } }, res);
    assert.notEqual(res.code, 200, `${bad} must never be fetched`);
  }
  passed++;
}

(async () => {
  await ssrf().catch((e) => { console.error(`FAIL  ssrf guard\n      ${e.message}`); process.exitCode = 1; });
  await e2e().catch((e) => { console.error(`FAIL  handler e2e\n      ${e.message}`); process.exitCode = 1; });
  await rateLimit().catch((e) => { console.error(`FAIL  rate limit\n      ${e.message}`); process.exitCode = 1; });
  console.log(process.exitCode ? `\n${passed} passed, failures above.` : `\nall ${passed} checks passed.`);
})();
