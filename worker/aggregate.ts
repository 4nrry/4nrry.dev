import {
  SCHEMA_VERSION,
  type LanguageStat,
  type OpenSourceCard,
  type OrgSummary,
  type PortfolioDataset,
  type RepoStat,
  type YearSummary,
} from '../shared/schema';
import { ALLOWED_ORG_OWNERS, ORG_META, SHOWCASE } from './config';
import type {
  ContributionsResponse,
  CountsResponse,
  LanguageEdges,
  OrgsResponse,
  ShowcaseResponse,
} from './queries';

export interface SyncWindows {
  /** ISO date (YYYY-MM-DD) of the window start, for search `created:>=`. */
  windowFrom: string;
  y1: { from: string; to: string; fromDate: string; toDate: string };
  y2: { from: string; to: string; fromDate: string; toDate: string };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftYears(d: Date, years: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

/** Two consecutive 1-year windows ending at `now` (contributionsCollection
 * caps ranges at one year, hence the split). */
export function computeWindows(now: Date): SyncWindows {
  const y2To = now;
  const y2From = shiftYears(now, -1);
  const y1From = shiftYears(now, -2);
  return {
    windowFrom: isoDate(y1From),
    y1: {
      from: y1From.toISOString(),
      to: y2From.toISOString(),
      fromDate: isoDate(y1From),
      toDate: isoDate(y2From),
    },
    y2: {
      from: y2From.toISOString(),
      to: y2To.toISOString(),
      fromDate: isoDate(y2From),
      toDate: isoDate(y2To),
    },
  };
}

export interface RawSyncData {
  contributions: ContributionsResponse;
  orgs: OrgsResponse;
  orgAliasToOrg: Record<string, string>;
  counts: CountsResponse;
  orgAliasToLogin: Record<string, string>;
  upstreamAliasToRepo: Record<string, string>;
  repoCounts: Array<{ response: CountsResponse; aliasToRepo: Record<string, string> }>;
  showcase: ShowcaseResponse;
  showcaseAliasToRepo: Record<string, string>;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-');
  return `${MONTH_SHORT[Number(month) - 1]} ${year!.slice(2)}`;
}

function yearLabel(fromDate: string, toDate: string): string {
  const fmt = (d: string) => {
    const [year, month] = d.split('-');
    return `${MONTH_SHORT[Number(month) - 1]} ${year}`;
  };
  return `${fmt(fromDate)} - ${fmt(toDate)}`;
}

function mergeCalendars(contributions: ContributionsResponse, windows: SyncWindows): Array<[string, number]> {
  const byDate = new Map<string, number>();
  const blocks = [contributions.user?.y1, contributions.user?.y2];
  // y2 last: on the shared boundary day the newer window wins.
  for (const block of blocks) {
    for (const week of block?.contributionCalendar.weeks ?? []) {
      for (const day of week.contributionDays) {
        byDate.set(day.date, day.contributionCount);
      }
    }
  }
  return [...byDate.entries()]
    .filter(([date]) => date >= windows.windowFrom && date <= windows.y2.toDate)
    .sort(([a], [b]) => (a < b ? -1 : 1));
}

function computeStreaks(calendar: Array<[string, number]>, today: string): { longest: number; current: number } {
  let longest = 0;
  let run = 0;
  let lastActiveRunEnd: string | null = null;
  let runEndingLength = 0;
  for (const [date, count] of calendar) {
    if (count > 0) {
      run += 1;
      lastActiveRunEnd = date;
      runEndingLength = run;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  // The current streak only counts if it reaches today or yesterday.
  let current = 0;
  if (lastActiveRunEnd) {
    const end = new Date(`${lastActiveRunEnd}T00:00:00Z`).getTime();
    const todayMs = new Date(`${today}T00:00:00Z`).getTime();
    const daysAgo = Math.round((todayMs - end) / 86_400_000);
    if (daysAgo <= 1) current = runEndingLength;
  }
  return { longest, current };
}

function count(counts: CountsResponse, alias: string): number {
  return counts[alias]?.issueCount ?? 0;
}

function sumLanguages(target: Map<string, { bytes: number; color: string | null }>, languages: LanguageEdges | null | undefined): void {
  for (const edge of languages?.edges ?? []) {
    const existing = target.get(edge.node.name);
    if (existing) {
      existing.bytes += edge.size;
      existing.color ??= edge.node.color;
    } else {
      target.set(edge.node.name, { bytes: edge.size, color: edge.node.color });
    }
  }
}

export function aggregate(raw: RawSyncData, windows: SyncWindows, now: Date): PortfolioDataset {
  const calendar = mergeCalendars(raw.contributions, windows);
  const contributionsTotal = calendar.reduce((sum, [, c]) => sum + c, 0);

  // Per-repo PR counts keyed by owner/name; built only from allowlisted plans.
  const prsByRepo = new Map<string, number>();
  for (const { response, aliasToRepo } of raw.repoCounts) {
    for (const [alias, repo] of Object.entries(aliasToRepo)) {
      prsByRepo.set(repo, count(response, alias));
    }
  }

  const y1 = raw.contributions.user?.y1;
  const y2 = raw.contributions.user?.y2;
  const inY1 = (date: string) => date < windows.y2.fromDate;
  const years: YearSummary[] = [
    {
      label: yearLabel(windows.y1.fromDate, windows.y1.toDate),
      from: windows.y1.fromDate,
      to: windows.y1.toDate,
      contributions: calendar.filter(([d]) => inY1(d)).reduce((s, [, c]) => s + c, 0),
      prs: count(raw.counts, 'prsY1'),
    },
    {
      label: yearLabel(windows.y2.fromDate, windows.y2.toDate),
      from: windows.y2.fromDate,
      to: windows.y2.toDate,
      contributions: calendar.filter(([d]) => !inY1(d)).reduce((s, [, c]) => s + c, 0),
      prs: count(raw.counts, 'prsY2'),
    },
  ];

  // Month buckets (ascending) for the heatmap matrix and the replay ticker.
  const monthKeys: string[] = [];
  const monthIndex = new Map<string, number>();
  for (const [date] of calendar) {
    const key = date.slice(0, 7);
    if (!monthIndex.has(key)) {
      monthIndex.set(key, monthKeys.length);
      monthKeys.push(key);
    }
  }
  const weekdayByMonth: number[][] = Array.from({ length: 7 }, () => monthKeys.map(() => 0));
  const monthlyTotals: number[] = monthKeys.map(() => 0);
  for (const [date, c] of calendar) {
    const col = monthIndex.get(date.slice(0, 7))!;
    const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon=0..Sun=6
    weekdayByMonth[weekday]![col] += c;
    monthlyTotals[col] += c;
  }

  const orgs: OrgSummary[] = [];
  for (const [alias, login] of Object.entries(raw.orgAliasToOrg)) {
    const node = raw.orgs[alias];
    if (!node) continue;
    const meta = ORG_META[login as (typeof ALLOWED_ORG_OWNERS)[number]];
    const orgCountAlias = Object.entries(raw.orgAliasToLogin).find(([, l]) => l === login)?.[0];
    const topRepos: RepoStat[] = node.repositories.nodes
      .map((repo) => ({
        name: repo.name,
        prs: prsByRepo.get(`${login}/${repo.name}`) ?? 0,
        description: repo.description,
        primaryLanguage: repo.primaryLanguage?.name ?? null,
      }))
      .filter((repo) => repo.prs > 0)
      .sort((a, b) => b.prs - a.prs)
      .slice(0, 8);
    orgs.push({
      login,
      displayName: meta?.displayName ?? login,
      narrative: meta?.narrative ?? '',
      narrativePt: meta?.narrativePt,
      accent: meta?.accent ?? '#a1a1aa',
      prCount: orgCountAlias ? count(raw.counts, orgCountAlias) : 0,
      repoCount: node.repositories.totalCount,
      topRepos,
    });
  }

  // Language footprint: org-owned code plus my own showcase repos. Upstream
  // projects I contribute to (other owners) would inflate the footprint with
  // code that is not mine, so they are excluded.
  const languageBytes = new Map<string, { bytes: number; color: string | null }>();
  for (const [alias, login] of Object.entries(raw.orgAliasToOrg)) {
    for (const repo of raw.orgs[alias]?.repositories.nodes ?? []) {
      if (!repo.isFork) sumLanguages(languageBytes, repo.languages);
    }
    void login;
  }
  for (const [alias, repo] of Object.entries(raw.showcaseAliasToRepo)) {
    if (repo.startsWith('4nrry/')) sumLanguages(languageBytes, raw.showcase[alias]?.languages);
  }
  const totalBytes = [...languageBytes.values()].reduce((s, l) => s + l.bytes, 0) || 1;
  const languages: LanguageStat[] = [...languageBytes.entries()]
    .map(([name, { bytes, color }]) => ({
      name,
      color,
      bytes,
      pct: Math.round((bytes / totalBytes) * 1000) / 10,
    }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 10);

  const repoByShowcaseAlias = new Map(
    Object.entries(raw.showcaseAliasToRepo).map(([alias, repo]) => [repo, raw.showcase[alias] ?? null]),
  );
  const upstreamByRepo = new Map(
    Object.entries(raw.upstreamAliasToRepo).map(([alias, repo]) => [repo, count(raw.counts, alias)]),
  );
  const openSource: OpenSourceCard[] = SHOWCASE.map((card) => {
    const primary = repoByShowcaseAlias.get(card.repos[0]!) ?? null;
    const entry: OpenSourceCard = {
      title: card.title,
      repos: [...card.repos],
      blurb: card.blurb,
      blurbPt: card.blurbPt,
      url: card.url,
      tech: [...card.tech],
    };
    if (card.npmPackage) entry.npmPackage = card.npmPackage;
    if (card.wantStars && primary) entry.stars = primary.stargazerCount;
    if (card.wantUpstreamPrs) entry.upstreamMergedPrs = upstreamByRepo.get(card.repos[0]!) ?? 0;
    return entry;
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    window: { from: windows.windowFrom, to: windows.y2.toDate },
    totals: {
      contributions: contributionsTotal,
      prsAuthored: count(raw.counts, 'prsAll'),
      prsMerged: count(raw.counts, 'prsMerged'),
      issues: count(raw.counts, 'issuesAll'),
      reviews:
        (y1?.totalPullRequestReviewContributions ?? 0) + (y2?.totalPullRequestReviewContributions ?? 0),
      reposContributed: [...prsByRepo.values()].filter((c) => c > 0).length,
    },
    years,
    calendar,
    streaks: computeStreaks(calendar, isoDate(now)),
    weekdayByMonth,
    monthLabels: monthKeys.map(monthLabel),
    monthlyTotals,
    orgs,
    languages,
    openSource,
  };
}
