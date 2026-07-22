#!/usr/bin/env node
/**
 * Asserts the public dataset only names allowlisted owners and repos.
 * Usage: node scripts/check-leaks.mjs [url-or-file]
 * Keep the allowlist in sync with worker/config.ts (it is public data).
 */
import { readFile } from 'node:fs/promises';

const ALLOWED_ORG_OWNERS = new Set(['smart-compost', 'LOTVSFinance', 'ocean-words']);
const ALLOWED_EXACT_REPOS = new Set([
  '4nrry/opencherry',
  '4nrry/homebrew-tap',
  '4nrry/4nrry.dev',
  'akitaonrails/ai-usagebar',
  'franceschinii/temakuri-frontend',
  'franceschinii/temakuri-backend',
]);

function isAllowedRepo(nameWithOwner) {
  const owner = nameWithOwner.split('/')[0];
  return ALLOWED_ORG_OWNERS.has(owner) || ALLOWED_EXACT_REPOS.has(nameWithOwner);
}

const URL_REPO_PATTERN = /github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)/g;
const BARE_REPO_PATTERN = /(?<![\w./@-])([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*)(?![\w/-])/g;
const HAS_LETTER = /[A-Za-z]/;

function findRepoShapedTokens(text) {
  const tokens = new Set();
  for (const match of text.matchAll(URL_REPO_PATTERN)) tokens.add(match[1]);
  for (const match of text.matchAll(BARE_REPO_PATTERN)) {
    const [owner, name] = match[1].split('/');
    if (HAS_LETTER.test(owner) && HAS_LETTER.test(name)) tokens.add(match[1]);
  }
  return [...tokens];
}

const source = process.argv[2] ?? 'http://localhost:8787/api/portfolio.json';
const text = source.startsWith('http')
  ? await (await fetch(source)).text()
  : await readFile(source, 'utf8');

const violations = [];

for (const token of findRepoShapedTokens(text)) {
  if (!isAllowedRepo(token)) violations.push(`token: ${token}`);
}

let dataset;
try {
  dataset = JSON.parse(text);
} catch {
  console.error('check-leaks: response is not JSON');
  process.exit(2);
}

for (const org of dataset.orgs ?? []) {
  if (!ALLOWED_ORG_OWNERS.has(org.login)) violations.push(`org: ${org.login}`);
}
for (const card of dataset.openSource ?? []) {
  for (const repo of card.repos ?? []) {
    if (!isAllowedRepo(repo)) violations.push(`openSource: ${repo}`);
  }
}

if (violations.length > 0) {
  console.error(`check-leaks: FAILED (${source})`);
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log(
  `check-leaks: OK (${source}) — ${dataset.totals?.contributions ?? '?'} contributions, ` +
    `${(dataset.orgs ?? []).length} orgs, ${(dataset.openSource ?? []).length} cards`,
);
