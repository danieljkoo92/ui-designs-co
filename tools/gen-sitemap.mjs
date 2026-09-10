/**
 * Regenerate sitemap.xml from the pages themselves.
 *
 *   node tools/gen-sitemap.mjs
 *
 * Nothing here is hand-maintained, which is the point -- the committed
 * sitemap had every page stamped 2026-08-28 long after they had changed.
 *
 *   which pages  <- robots.txt (anything Disallow'd is left out, so the two
 *                   files cannot drift apart)
 *   <loc>        <- each page's own <link rel="canonical">
 *   <lastmod>    <- git's last commit date for that file
 *
 * Run it before pushing whenever page content changes. It rewrites
 * sitemap.xml in place and prints what it did.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (f) => join(ROOT, f);

// Homepage first, then the pages that sell, then the reference pages.
// Google ignores <priority>, but it is already in the committed sitemap and
// costs nothing to keep honest.
const PRIORITY = {
  '': '1.0',
  'plans.html': '0.8',
  'why.html': '0.8',
  'how-it-works.html': '0.8',
  'book.html': '0.8',
};

// Pages that exist but must never be listed, regardless of robots.txt.
const NEVER = new Set(['404.html']);

const disallowed = new Set(
  readFileSync(p('robots.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^Disallow:/i.test(l))
    .map((l) => l.replace(/^Disallow:\s*/i, '').replace(/^\//, ''))
);

const lastmod = (file) => {
  const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim();
  if (!out) throw new Error(`${file} has no git history -- commit it first`);
  return out;
};

const entries = [];
for (const file of readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort()) {
  if (NEVER.has(file) || disallowed.has(file)) continue;

  const html = readFileSync(p(file), 'utf8');
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (!canonical) {
    console.warn(`skipped ${file}: no canonical tag`);
    continue;
  }
  // Sort by the canonical's path so the homepage ("") lands first.
  const slug = new URL(canonical).pathname.replace(/^\//, '');
  entries.push({ slug, canonical, lastmod: lastmod(file), file });
}

entries.sort((a, b) => a.slug.localeCompare(b.slug));

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries.map((e) =>
    [
      '  <url>',
      `    <loc>${e.canonical}</loc>`,
      `    <lastmod>${e.lastmod}</lastmod>`,
      `    <priority>${PRIORITY[e.slug] ?? '0.5'}</priority>`,
      '  </url>',
    ].join('\n')
  ),
  '</urlset>',
  '',
].join('\n');

writeFileSync(p('sitemap.xml'), xml);

console.log(`sitemap.xml: ${entries.length} urls`);
for (const e of entries) console.log(`  ${e.lastmod}  ${e.canonical}`);
const left = [...disallowed].filter((d) => d.endsWith('.html'));
if (left.length) console.log(`excluded via robots.txt: ${left.join(', ')}`);
