import type { SyncMeta } from '../shared/schema';
import { aggregate, computeWindows, type RawSyncData } from './aggregate';
import { ALLOWED_EXACT_REPOS, GITHUB_LOGIN } from './config';
import { graphql } from './github';
import {
  buildCountsQuery,
  buildOrgsQuery,
  buildRepoPrCountQueries,
  buildShowcaseQuery,
  CONTRIBUTIONS_QUERY,
  type ContributionsResponse,
  type CountsResponse,
  type OrgsResponse,
  type ShowcaseResponse,
} from './queries';
import { sanitizeDataset } from './sanitize';

export const DATASET_KEY = 'portfolio:v1';
export const META_KEY = 'sync:meta';

export interface SyncOutcome {
  generatedAt: string;
  durationMs: number;
  rateLimitRemaining: number | null;
  contributions: number;
  prsAuthored: number;
  reposCounted: number;
}

export async function readMeta(env: Env): Promise<SyncMeta | null> {
  return env.PORTFOLIO_KV.get<SyncMeta>(META_KEY, 'json');
}

export async function runSync(env: Env): Promise<SyncOutcome> {
  const startedAtMs = Date.now();
  const now = new Date();
  const attemptAt = now.toISOString();
  const previous = await readMeta(env).catch(() => null);

  try {
    const windows = computeWindows(now);

    const contributions = await graphql<ContributionsResponse>(env.GITHUB_TOKEN, CONTRIBUTIONS_QUERY, {
      login: GITHUB_LOGIN,
      y1From: windows.y1.from,
      y1To: windows.y1.to,
      y2From: windows.y2.from,
      y2To: windows.y2.to,
    });

    const orgsPlan = buildOrgsQuery();
    const orgs = await graphql<OrgsResponse>(env.GITHUB_TOKEN, orgsPlan.query);

    const countsPlan = buildCountsQuery(
      GITHUB_LOGIN,
      windows.windowFrom,
      { from: windows.y1.fromDate, to: windows.y1.toDate },
      { from: windows.y2.fromDate, to: windows.y2.toDate },
    );
    const counts = await graphql<CountsResponse>(env.GITHUB_TOKEN, countsPlan.query);

    // Per-repo PR counts for discovered org repos plus the exact allowlist.
    // Both sources are allowlist-derived; nothing else is ever queried.
    const orgRepoNames: string[] = [];
    for (const [alias, login] of Object.entries(orgsPlan.aliasToOrg)) {
      for (const node of orgs[alias]?.repositories.nodes ?? []) {
        orgRepoNames.push(`${login}/${node.name}`);
      }
    }
    const allRepos = [...new Set([...orgRepoNames, ...ALLOWED_EXACT_REPOS])];
    const repoCounts: RawSyncData['repoCounts'] = [];
    for (const plan of buildRepoPrCountQueries(allRepos, GITHUB_LOGIN, windows.windowFrom)) {
      repoCounts.push({
        response: await graphql<CountsResponse>(env.GITHUB_TOKEN, plan.query),
        aliasToRepo: plan.aliasToRepo,
      });
    }

    const showcasePlan = buildShowcaseQuery();
    const showcase = await graphql<ShowcaseResponse>(env.GITHUB_TOKEN, showcasePlan.query);

    const raw: RawSyncData = {
      contributions,
      orgs,
      orgAliasToOrg: orgsPlan.aliasToOrg,
      counts,
      orgAliasToLogin: countsPlan.orgAliasToLogin,
      upstreamAliasToRepo: countsPlan.upstreamAliasToRepo,
      repoCounts,
      showcase,
      showcaseAliasToRepo: showcasePlan.aliasToRepo,
    };

    const { dataset, violations } = sanitizeDataset(aggregate(raw, windows, now));
    if (violations.length > 0) {
      throw new Error(`sanitize refused to publish: ${violations.join(', ').slice(0, 400)}`);
    }

    await env.PORTFOLIO_KV.put(DATASET_KEY, JSON.stringify(dataset), {
      metadata: { generatedAt: dataset.generatedAt },
    });
    const durationMs = Date.now() - startedAtMs;
    const meta: SyncMeta = {
      lastSuccessAt: attemptAt,
      lastAttemptAt: attemptAt,
      lastError: null,
      durationMs,
      rateLimitRemaining: contributions.rateLimit?.remaining ?? null,
      violations: 0,
    };
    await env.PORTFOLIO_KV.put(META_KEY, JSON.stringify(meta));

    return {
      generatedAt: dataset.generatedAt,
      durationMs,
      rateLimitRemaining: meta.rateLimitRemaining,
      contributions: dataset.totals.contributions,
      prsAuthored: dataset.totals.prsAuthored,
      reposCounted: allRepos.length,
    };
  } catch (error) {
    // Never touch the dataset key on failure: the last good document keeps
    // serving. Record the failure for /api/health.
    const meta: SyncMeta = {
      lastSuccessAt: previous?.lastSuccessAt ?? null,
      lastAttemptAt: attemptAt,
      lastError: String(error).slice(0, 500),
      durationMs: Date.now() - startedAtMs,
      rateLimitRemaining: previous?.rateLimitRemaining ?? null,
      violations: previous?.violations ?? 0,
    };
    await env.PORTFOLIO_KV.put(META_KEY, JSON.stringify(meta)).catch(() => {});
    throw error;
  }
}
