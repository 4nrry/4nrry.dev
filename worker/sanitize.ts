import type { PortfolioDataset } from '../shared/schema';
import { ALLOWED_EXACT_REPOS, ALLOWED_ORG_OWNERS } from './config';

const allowedOrgOwners = new Set<string>(ALLOWED_ORG_OWNERS);
const allowedExactRepos = new Set<string>(ALLOWED_EXACT_REPOS);

/** Any repo under an allowlisted org, or an exact allowlisted owner/name. */
export function isAllowedRepo(nameWithOwner: string): boolean {
  const owner = nameWithOwner.split('/')[0];
  if (owner && allowedOrgOwners.has(owner)) return true;
  return allowedExactRepos.has(nameWithOwner);
}

const HAS_LETTER = /[A-Za-z]/;
// owner/name pairs inside GitHub URLs (the bare pattern skips /-preceded tokens).
const URL_REPO_PATTERN = /github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)/g;
// Standalone owner/name tokens. GitHub owners have no dots (rules out
// domains like npmjs.com/package) and the lookbehind/lookahead keep this from
// matching fragments of longer paths. Requiring a letter on both sides rules
// out dates ("2024/07") and ratios.
const BARE_REPO_PATTERN = /(?<![\w./@-])([A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*)(?![\w/-])/g;

export function findRepoShapedTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(URL_REPO_PATTERN)) {
    tokens.add(match[1]!);
  }
  for (const match of text.matchAll(BARE_REPO_PATTERN)) {
    const token = match[1]!;
    const [owner, name] = token.split('/');
    if (HAS_LETTER.test(owner!) && HAS_LETTER.test(name!)) tokens.add(token);
  }
  return [...tokens];
}

export interface SanitizeResult {
  dataset: PortfolioDataset;
  violations: string[];
}

/**
 * Final gate before any KV write. Structural pass drops anything that names a
 * non-allowlisted repo; the paranoid pass then scans the whole serialized
 * document for owner/name-shaped tokens. The caller must refuse to publish
 * when violations are non-empty: by construction there should never be any,
 * so a violation means a bug upstream and failing closed keeps the last good
 * dataset serving.
 */
export function sanitizeDataset(dataset: PortfolioDataset): SanitizeResult {
  const violations: string[] = [];

  const orgs = dataset.orgs
    .filter((org) => {
      if (allowedOrgOwners.has(org.login)) return true;
      violations.push(`org:${org.login}`);
      return false;
    })
    .map((org) => ({
      ...org,
      topRepos: org.topRepos.filter((repo) => {
        if (isAllowedRepo(`${org.login}/${repo.name}`)) return true;
        violations.push(`orgRepo:${org.login}/${repo.name}`);
        return false;
      }),
    }));

  const openSource = dataset.openSource.filter((card) => {
    const offending = card.repos.filter((repo) => !isAllowedRepo(repo));
    for (const repo of offending) violations.push(`openSource:${repo}`);
    return offending.length === 0;
  });

  const cleaned: PortfolioDataset = { ...dataset, orgs, openSource };

  for (const token of findRepoShapedTokens(JSON.stringify(cleaned))) {
    if (!isAllowedRepo(token)) violations.push(`token:${token}`);
  }

  return { dataset: cleaned, violations };
}
