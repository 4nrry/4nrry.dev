/**
 * The single JSON document the worker materializes into KV and the frontend
 * consumes from GET /api/portfolio.json. Everything in here is public by
 * construction: it must survive worker/sanitize.ts before any KV write.
 */

export const SCHEMA_VERSION = 1 as const;

export interface RepoStat {
  /** Repo name only (owner is the org card it lives under). */
  name: string;
  prs: number;
  description: string | null;
  primaryLanguage: string | null;
}

export interface OrgSummary {
  login: string;
  displayName: string;
  narrative: string;
  /** PT-BR variant; clients fall back to `narrative` when absent. */
  narrativePt?: string;
  accent: string;
  prCount: number;
  repoCount: number;
  topRepos: RepoStat[];
}

export interface LanguageStat {
  name: string;
  color: string | null;
  bytes: number;
  pct: number;
}

export interface OpenSourceCard {
  title: string;
  /** owner/name, all allowlisted. First entry is the primary link target. */
  repos: string[];
  blurb: string;
  /** PT-BR variant; clients fall back to `blurb` when absent. */
  blurbPt?: string;
  url: string;
  tech: string[];
  stars?: number;
  upstreamMergedPrs?: number;
  npmPackage?: string;
}

export interface YearSummary {
  label: string;
  from: string;
  to: string;
  contributions: number;
  prs: number;
}

export interface PortfolioDataset {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  window: { from: string; to: string };
  totals: {
    contributions: number;
    prsAuthored: number;
    prsMerged: number;
    issues: number;
    reviews: number;
    reposContributed: number;
  };
  years: YearSummary[];
  /** [ISO date, contribution count] per day, ascending, whole window. */
  calendar: Array<[string, number]>;
  streaks: { longest: number; current: number };
  /** 7 rows (Mon..Sun) x monthLabels.length columns, contribution sums. */
  weekdayByMonth: number[][];
  monthLabels: string[];
  monthlyTotals: number[];
  orgs: OrgSummary[];
  languages: LanguageStat[];
  openSource: OpenSourceCard[];
}

export interface SyncMeta {
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  durationMs: number | null;
  rateLimitRemaining: number | null;
  violations: number;
}
