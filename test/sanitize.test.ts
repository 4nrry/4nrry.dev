import { describe, expect, it } from 'vitest';
import type { PortfolioDataset } from '../shared/schema';
import { findRepoShapedTokens, isAllowedRepo, sanitizeDataset } from '../worker/sanitize';

function baseDataset(overrides: Partial<PortfolioDataset> = {}): PortfolioDataset {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-22T12:00:00.000Z',
    window: { from: '2024-07-22', to: '2026-07-22' },
    totals: { contributions: 10, prsAuthored: 5, prsMerged: 4, issues: 1, reviews: 0, reposContributed: 2 },
    years: [],
    calendar: [['2026-07-22', 1]],
    streaks: { longest: 1, current: 1 },
    weekdayByMonth: [[], [], [], [], [], [], []],
    monthLabels: [],
    monthlyTotals: [],
    orgs: [],
    languages: [],
    openSource: [],
    ...overrides,
  };
}

describe('isAllowedRepo', () => {
  it('allows any repo under an allowlisted org', () => {
    expect(isAllowedRepo('smart-compost/whatever-new-repo')).toBe(true);
    expect(isAllowedRepo('LOTVSFinance/lotvs-app-backend')).toBe(true);
    expect(isAllowedRepo('ocean-words/ocean-words')).toBe(true);
  });

  it('allows exact allowlisted repos', () => {
    expect(isAllowedRepo('4nrry/opencherry')).toBe(true);
    expect(isAllowedRepo('akitaonrails/ai-usagebar')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isAllowedRepo('4nrry/some-private-thing')).toBe(false);
    expect(isAllowedRepo('someone/else')).toBe(false);
    expect(isAllowedRepo('akitaonrails/github-visualize')).toBe(false);
  });
});

describe('findRepoShapedTokens', () => {
  it('finds bare owner/name tokens', () => {
    expect(findRepoShapedTokens('shipped in evil-owner/secret-repo today')).toEqual([
      'evil-owner/secret-repo',
    ]);
  });

  it('finds owner/name inside GitHub URLs', () => {
    expect(findRepoShapedTokens('see https://github.com/evil-owner/secret-repo/pull/1')).toContain(
      'evil-owner/secret-repo',
    );
  });

  it('ignores dates, ratios and domain fragments', () => {
    expect(findRepoShapedTokens('happened on 2024/07 with 16/9 output')).toEqual([]);
    expect(findRepoShapedTokens('published at npmjs.com/package/foo')).toEqual([]);
  });

  it('ignores scoped npm package names', () => {
    expect(findRepoShapedTokens('install @tailwindcss/vite and @smart-compost/mcp')).toEqual([]);
  });
});

describe('sanitizeDataset', () => {
  it('passes a clean dataset through untouched', () => {
    const dataset = baseDataset({
      orgs: [
        {
          login: 'smart-compost',
          displayName: 'Smart Compost',
          narrative: 'IoT platform.',
          accent: '#4ade80',
          prCount: 701,
          repoCount: 28,
          topRepos: [{ name: 'composting-backend', prs: 90, description: null, primaryLanguage: 'TypeScript' }],
        },
      ],
      openSource: [
        {
          title: 'OpenCherry',
          repos: ['4nrry/opencherry'],
          blurb: 'Flagship.',
          url: 'https://opencherry.dev',
          tech: ['TypeScript'],
        },
      ],
    });
    const result = sanitizeDataset(dataset);
    expect(result.violations).toEqual([]);
    expect(result.dataset).toEqual(dataset);
  });

  it('drops non-allowlisted orgs and records the violation', () => {
    const result = sanitizeDataset(
      baseDataset({
        orgs: [
          {
            login: 'evil-org',
            displayName: 'Evil',
            narrative: '',
            accent: '#fff',
            prCount: 1,
            repoCount: 1,
            topRepos: [],
          },
        ],
      }),
    );
    expect(result.dataset.orgs).toEqual([]);
    expect(result.violations).toContain('org:evil-org');
  });

  it('drops open source cards naming non-allowlisted repos', () => {
    const result = sanitizeDataset(
      baseDataset({
        openSource: [
          {
            title: 'Leaky',
            repos: ['someone/private-thing'],
            blurb: '',
            url: 'https://example.com',
            tech: [],
          },
        ],
      }),
    );
    expect(result.dataset.openSource).toEqual([]);
    expect(result.violations).toContain('openSource:someone/private-thing');
  });

  it('flags repo-shaped tokens hiding in free text', () => {
    const result = sanitizeDataset(
      baseDataset({
        orgs: [
          {
            login: 'smart-compost',
            displayName: 'Smart Compost',
            narrative: 'Secretly also evil-owner/hidden-repo lives here.',
            accent: '#4ade80',
            prCount: 1,
            repoCount: 1,
            topRepos: [],
          },
        ],
      }),
    );
    expect(result.violations).toContain('token:evil-owner/hidden-repo');
  });
});
