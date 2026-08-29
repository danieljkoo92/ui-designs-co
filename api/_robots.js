// robots.txt parsing for the site check.
// Underscore prefix: bundled with the functions, never routed as an endpoint.
//
// Resolves a real verdict per crawler rather than grepping for the bot name.
// Grepping gets this wrong both ways — a site can name GPTBot in an Allow rule
// and still block it via a wildcard group, or name it in a comment and not
// block it at all.

// These are three different jobs and blocking them costs three different
// things. Every "is my site blocking AI?" checker lumps them into one list and
// is wrong for most of it:
//
//   citation  — indexes you for AI answers. Blocked = you cannot be cited.
//   userFetch — fires only when a person asks an assistant about your page.
//   training  — builds model corpora. Blocking costs nothing in citations, and
//               plenty of businesses block it deliberately.
//
// The distinction is not academic: blocking GPTBot has no effect on whether
// ChatGPT cites you, because ChatGPT search uses OAI-SearchBot. Google-Extended
// is likewise training-only — AI Overviews are served by Googlebot.
const CITATION_AGENTS = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot'];
const USER_FETCH_AGENTS = ['ChatGPT-User', 'Claude-User', 'Perplexity-User'];
const TRAINING_AGENTS = ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended'];
const SEARCH_AGENTS = ['Googlebot', 'Bingbot'];

// Kept for callers that just want "everything we know about".
const AI_AGENTS = [...CITATION_AGENTS, ...USER_FETCH_AGENTS, ...TRAINING_AGENTS];

function parseRobots(raw) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;

  for (const line of String(raw).split(/\r?\n/)) {
    const stripped = line.replace(/#.*$/, '').trim();
    if (!stripped) continue;
    const idx = stripped.indexOf(':');
    if (idx === -1) continue;
    const field = stripped.slice(0, idx).trim().toLowerCase();
    const value = stripped.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === 'allow' || field === 'disallow') {
      if (!current) { current = { agents: ['*'], rules: [] }; groups.push(current); }
      current.rules.push({ type: field, path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function pathMatches(pattern, path) {
  if (pattern === '') return false;               // empty Disallow means allow all
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const parts = body.split('*');
  let cursor = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '') continue;
    const at = i === 0 ? (path.startsWith(part) ? 0 : -1) : path.indexOf(part, cursor);
    if (at === -1) return false;
    cursor = at + part.length;
  }
  if (anchored) return cursor === path.length;
  return true;
}

function robotsVerdict(raw, agent, path) {
  if (raw == null) return 'unspecified';
  const groups = parseRobots(raw);
  const wanted = String(agent).toLowerCase();

  let chosen = groups.find((g) => g.agents.includes(wanted));
  if (!chosen) chosen = groups.find((g) => g.agents.includes('*'));
  if (!chosen) return 'unspecified';

  let best = null;
  for (const rule of chosen.rules) {
    if (!pathMatches(rule.path, path || '/')) continue;
    const len = rule.path.replace(/\$$/, '').length;
    if (!best || len > best.len || (len === best.len && rule.type === 'allow')) {
      best = { type: rule.type, len };
    }
  }
  if (!best) return 'unspecified';
  return best.type === 'allow' ? 'allow' : 'disallow';
}

// Returns the agents actively blocked. "unspecified" is fine — it means allowed.
function blockedAgents(raw, path, agents) {
  return (agents || AI_AGENTS).filter((a) => robotsVerdict(raw, a, path) === 'disallow');
}

module.exports = {
  AI_AGENTS, SEARCH_AGENTS, CITATION_AGENTS, USER_FETCH_AGENTS, TRAINING_AGENTS,
  parseRobots, robotsVerdict, blockedAgents
};
