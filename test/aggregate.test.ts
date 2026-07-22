import { describe, expect, it } from 'vitest';
import { aggregate, computeWindows, type RawSyncData } from '../worker/aggregate';
import type { ContributionsBlock } from '../worker/queries';

const NOW = new Date('2026-07-22T12:00:00.000Z');

function block(days: Array<[string, number]>, reviews = 0): ContributionsBlock {
  return {
    totalCommitContributions: 0,
    totalPullRequestContributions: 0,
    totalPullRequestReviewContributions: reviews,
    totalIssueContributions: 0,
    restrictedContributionsCount: 0,
    contributionCalendar: {
      totalContributions: days.reduce((s, [, c]) => s + c, 0),
      weeks: [{ contributionDays: days.map(([date, contributionCount]) => ({ date, contributionCount })) }],
    },
  };
}

function rawFixture(): RawSyncData {
  return {
    contributions: {
      user: {
        y1: block(
          [
            ['2024-07-25', 2],
            ['2025-07-22', 9], // boundary day, y2 version below must win
          ],
          1,
        ),
        y2: block(
          [
            ['2025-07-22', 3],
            ['2026-07-16', 1],
            ['2026-07-17', 0],
            ['2026-07-18', 2],
            ['2026-07-19', 3],
            ['2026-07-20', 4],
            ['2026-07-21', 2],
            ['2026-07-22', 1],
          ],
          2,
        ),
      },
      rateLimit: { remaining: 4990 },
    },
    orgs: {
      o0: {
        login: 'smart-compost',
        repositories: {
          totalCount: 3,
          nodes: [
            {
              name: 'composting-backend',
              isPrivate: true,
              isArchived: false,
              isFork: false,
              description: 'Composting API',
              pushedAt: '2026-07-01T00:00:00Z',
              primaryLanguage: { name: 'TypeScript', color: '#3178c6' },
              languages: { edges: [{ size: 1000, node: { name: 'TypeScript', color: '#3178c6' } }] },
            },
            {
              name: 'some-fork',
              isPrivate: true,
              isArchived: false,
              isFork: true,
              description: null,
              pushedAt: null,
              primaryLanguage: { name: 'Rust', color: '#dea584' },
              languages: { edges: [{ size: 500, node: { name: 'Rust', color: '#dea584' } }] },
            },
            {
              name: 'zero-pr-repo',
              isPrivate: true,
              isArchived: false,
              isFork: false,
              description: null,
              pushedAt: null,
              primaryLanguage: null,
              languages: { edges: [] },
            },
          ],
        },
      },
    },
    orgAliasToOrg: { o0: 'smart-compost' },
    counts: {
      prsAll: { issueCount: 1018 },
      prsMerged: { issueCount: 995 },
      issuesAll: { issueCount: 38 },
      prsY1: { issueCount: 4 },
      prsY2: { issueCount: 1014 },
      org0: { issueCount: 701 },
      up0: { issueCount: 3 },
    },
    orgAliasToLogin: { org0: 'smart-compost' },
    upstreamAliasToRepo: { up0: 'akitaonrails/ai-usagebar' },
    repoCounts: [
      {
        response: { r0: { issueCount: 90 }, r1: { issueCount: 0 }, r2: { issueCount: 56 } },
        aliasToRepo: {
          r0: 'smart-compost/composting-backend',
          r1: 'smart-compost/zero-pr-repo',
          r2: '4nrry/opencherry',
        },
      },
    ],
    showcase: {
      s0: {
        nameWithOwner: '4nrry/opencherry',
        stargazerCount: 2,
        description: 'Flagship',
        url: 'https://github.com/4nrry/opencherry',
        primaryLanguage: { name: 'TypeScript', color: '#3178c6' },
        languages: {
          edges: [
            { size: 200, node: { name: 'TypeScript', color: '#3178c6' } },
            { size: 100, node: { name: 'Rust', color: '#dea584' } },
          ],
        },
      },
      s1: {
        nameWithOwner: 'akitaonrails/ai-usagebar',
        stargazerCount: 50,
        description: 'Waybar widget',
        url: 'https://github.com/akitaonrails/ai-usagebar',
        primaryLanguage: { name: 'Rust', color: '#dea584' },
        languages: { edges: [{ size: 9999, node: { name: 'Rust', color: '#dea584' } }] },
      },
    },
    showcaseAliasToRepo: { s0: '4nrry/opencherry', s1: 'akitaonrails/ai-usagebar' },
  };
}

describe('computeWindows', () => {
  it('splits the last 2 years into two 1-year windows', () => {
    const windows = computeWindows(NOW);
    expect(windows.windowFrom).toBe('2024-07-22');
    expect(windows.y1.fromDate).toBe('2024-07-22');
    expect(windows.y1.toDate).toBe('2025-07-22');
    expect(windows.y2.fromDate).toBe('2025-07-22');
    expect(windows.y2.toDate).toBe('2026-07-22');
  });
});

describe('aggregate', () => {
  const dataset = aggregate(rawFixture(), computeWindows(NOW), NOW);

  it('merges calendars with the newer window winning the boundary day', () => {
    const boundary = dataset.calendar.find(([date]) => date === '2025-07-22');
    expect(boundary?.[1]).toBe(3);
  });

  it('sums totals from the merged calendar and search counts', () => {
    // 2 + 3 + 1 + 0 + 2 + 3 + 4 + 2 + 1
    expect(dataset.totals.contributions).toBe(18);
    expect(dataset.totals.prsAuthored).toBe(1018);
    expect(dataset.totals.prsMerged).toBe(995);
    expect(dataset.totals.issues).toBe(38);
    expect(dataset.totals.reviews).toBe(3);
    expect(dataset.totals.reposContributed).toBe(2);
  });

  it('splits years at the window boundary', () => {
    expect(dataset.years[0]?.label).toBe('Jul 2024 - Jul 2025');
    expect(dataset.years[0]?.contributions).toBe(2);
    expect(dataset.years[0]?.prs).toBe(4);
    expect(dataset.years[1]?.contributions).toBe(16);
    expect(dataset.years[1]?.prs).toBe(1014);
  });

  it('computes streaks over consecutive active days ending today', () => {
    expect(dataset.streaks.longest).toBe(5);
    expect(dataset.streaks.current).toBe(5);
  });

  it('builds the weekday-by-month matrix aligned with month labels', () => {
    expect(dataset.weekdayByMonth).toHaveLength(7);
    for (const row of dataset.weekdayByMonth) {
      expect(row).toHaveLength(dataset.monthLabels.length);
    }
    expect(dataset.monthLabels).toContain('Jul 24');
    expect(dataset.monthlyTotals.reduce((a, b) => a + b, 0)).toBe(dataset.totals.contributions);
  });

  it('keeps only org repos with PRs, sorted', () => {
    const org = dataset.orgs.find((o) => o.login === 'smart-compost');
    expect(org?.prCount).toBe(701);
    expect(org?.repoCount).toBe(3);
    expect(org?.topRepos.map((r) => r.name)).toEqual(['composting-backend']);
  });

  it('aggregates languages from org non-forks and own showcase repos only', () => {
    const typescript = dataset.languages.find((l) => l.name === 'TypeScript');
    const rust = dataset.languages.find((l) => l.name === 'Rust');
    // org 1000 + opencherry 200; the org fork (500) and akitaonrails (9999) are excluded
    expect(typescript?.bytes).toBe(1200);
    expect(rust?.bytes).toBe(100);
  });

  it('wires live numbers into showcase cards', () => {
    const opencherry = dataset.openSource.find((c) => c.title === 'OpenCherry');
    const usagebar = dataset.openSource.find((c) => c.title === 'ai-usagebar');
    expect(opencherry?.stars).toBe(2);
    expect(usagebar?.upstreamMergedPrs).toBe(3);
  });
});
