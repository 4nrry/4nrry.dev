import { ALLOWED_ORG_OWNERS, SHOWCASE } from './config';

/** Raw response shapes, consumed by aggregate.ts. */

export interface ContributionDay {
  date: string;
  contributionCount: number;
}

export interface ContributionsBlock {
  totalCommitContributions: number;
  totalPullRequestContributions: number;
  totalPullRequestReviewContributions: number;
  totalIssueContributions: number;
  restrictedContributionsCount: number;
  contributionCalendar: {
    totalContributions: number;
    weeks: Array<{ contributionDays: ContributionDay[] }>;
  };
}

export interface ContributionsResponse {
  user: { y1: ContributionsBlock; y2: ContributionsBlock } | null;
  rateLimit: { remaining: number } | null;
}

export interface LanguageEdges {
  edges: Array<{ size: number; node: { name: string; color: string | null } }> | null;
}

export interface OrgRepoNode {
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  description: string | null;
  pushedAt: string | null;
  primaryLanguage: { name: string; color: string | null } | null;
  languages: LanguageEdges | null;
}

export interface OrgNode {
  login: string;
  repositories: { totalCount: number; nodes: OrgRepoNode[] };
}

export type OrgsResponse = Record<string, OrgNode | null>;

export interface SearchCount {
  issueCount: number;
}

export type CountsResponse = Record<string, SearchCount | null>;

export interface ShowcaseRepoNode {
  nameWithOwner: string;
  stargazerCount: number;
  description: string | null;
  url: string;
  primaryLanguage: { name: string; color: string | null } | null;
  languages: LanguageEdges | null;
}

export type ShowcaseResponse = Record<string, ShowcaseRepoNode | null>;

/** Query builders. Aliases are always generated (`o0`, `r12`), never derived
 * from repo names, so they are valid GraphQL identifiers by construction. */

export const CONTRIBUTIONS_QUERY = `
query ($login: String!, $y1From: DateTime!, $y1To: DateTime!, $y2From: DateTime!, $y2To: DateTime!) {
  user(login: $login) {
    y1: contributionsCollection(from: $y1From, to: $y1To) { ...cc }
    y2: contributionsCollection(from: $y2From, to: $y2To) { ...cc }
  }
  rateLimit { remaining }
}
fragment cc on ContributionsCollection {
  totalCommitContributions
  totalPullRequestContributions
  totalPullRequestReviewContributions
  totalIssueContributions
  restrictedContributionsCount
  contributionCalendar {
    totalContributions
    weeks { contributionDays { date contributionCount } }
  }
}
`;

const LANGUAGES_SELECTION =
  'languages(first: 6, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } }';

export function buildOrgsQuery(): { query: string; aliasToOrg: Record<string, string> } {
  const aliasToOrg: Record<string, string> = {};
  const blocks = ALLOWED_ORG_OWNERS.map((login, i) => {
    const alias = `o${i}`;
    aliasToOrg[alias] = login;
    return `${alias}: organization(login: ${JSON.stringify(login)}) {
      login
      repositories(first: 50, orderBy: {field: PUSHED_AT, direction: DESC}) {
        totalCount
        nodes {
          name isPrivate isArchived isFork description pushedAt
          primaryLanguage { name color }
          ${LANGUAGES_SELECTION}
        }
      }
    }`;
  });
  return { query: `query {\n${blocks.join('\n')}\n}`, aliasToOrg };
}

function searchCountBlock(alias: string, search: string): string {
  return `${alias}: search(query: ${JSON.stringify(search)}, type: ISSUE, first: 0) { issueCount }`;
}

export interface CountsQueryPlan {
  query: string;
  orgAliasToLogin: Record<string, string>;
  upstreamAliasToRepo: Record<string, string>;
}

/**
 * Global totals, per-org PR counts and upstream-PR counts, all as exact
 * `issueCount` totals (never paginated, so the search 1000-node cap is moot).
 */
export function buildCountsQuery(
  login: string,
  windowFrom: string,
  y1: { from: string; to: string },
  y2: { from: string; to: string },
): CountsQueryPlan {
  const author = `author:${login}`;
  const since = `created:>=${windowFrom}`;
  const blocks = [
    searchCountBlock('prsAll', `is:pr ${author} ${since}`),
    searchCountBlock('prsMerged', `is:pr is:merged ${author} ${since}`),
    searchCountBlock('issuesAll', `is:issue ${author} ${since}`),
    searchCountBlock('prsY1', `is:pr ${author} created:${y1.from}..${y1.to}`),
    searchCountBlock('prsY2', `is:pr ${author} created:${y2.from}..${y2.to}`),
  ];

  const orgAliasToLogin: Record<string, string> = {};
  ALLOWED_ORG_OWNERS.forEach((org, i) => {
    const alias = `org${i}`;
    orgAliasToLogin[alias] = org;
    blocks.push(searchCountBlock(alias, `is:pr ${author} org:${org} ${since}`));
  });

  const upstreamAliasToRepo: Record<string, string> = {};
  SHOWCASE.filter((card) => card.wantUpstreamPrs)
    .flatMap((card) => card.repos)
    .forEach((repo, i) => {
      const alias = `up${i}`;
      upstreamAliasToRepo[alias] = repo;
      blocks.push(searchCountBlock(alias, `is:pr is:merged ${author} repo:${repo}`));
    });

  return { query: `query {\n${blocks.join('\n')}\n}`, orgAliasToLogin, upstreamAliasToRepo };
}

export interface RepoCountsQueryPlan {
  query: string;
  aliasToRepo: Record<string, string>;
}

/**
 * Per-repo PR counts. `repos` MUST come from the allowlist (org discovery +
 * ALLOWED_EXACT_REPOS); this module never invents repo names.
 */
export function buildRepoPrCountQueries(
  repos: string[],
  login: string,
  windowFrom: string,
  chunkSize = 25,
): RepoCountsQueryPlan[] {
  const plans: RepoCountsQueryPlan[] = [];
  for (let start = 0; start < repos.length; start += chunkSize) {
    const chunk = repos.slice(start, start + chunkSize);
    const aliasToRepo: Record<string, string> = {};
    const blocks = chunk.map((repo, i) => {
      const alias = `r${start + i}`;
      aliasToRepo[alias] = repo;
      return searchCountBlock(alias, `is:pr author:${login} repo:${repo} created:>=${windowFrom}`);
    });
    plans.push({ query: `query {\n${blocks.join('\n')}\n}`, aliasToRepo });
  }
  return plans;
}

export function buildShowcaseQuery(): { query: string; aliasToRepo: Record<string, string> } {
  const repos = [...new Set(SHOWCASE.flatMap((card) => card.repos))];
  const aliasToRepo: Record<string, string> = {};
  const blocks = repos.map((repo, i) => {
    const alias = `s${i}`;
    aliasToRepo[alias] = repo;
    const [owner, name] = repo.split('/');
    return `${alias}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
      nameWithOwner stargazerCount description url
      primaryLanguage { name color }
      ${LANGUAGES_SELECTION}
    }`;
  });
  return { query: `query {\n${blocks.join('\n')}\n}`, aliasToRepo };
}
