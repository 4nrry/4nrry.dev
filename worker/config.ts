/**
 * The allowlist is the privacy boundary of this site. Per-repo GraphQL queries
 * are generated exclusively from these lists, and sanitize.ts re-checks every
 * owner/name-shaped string in the final dataset against them. Anything not
 * listed here can only ever surface inside aggregate numbers.
 *
 * Never add a blocklist of private names here: this repo is public.
 */

export const GITHUB_LOGIN = '4nrry';

export const ALLOWED_ORG_OWNERS = ['smart-compost', 'LOTVSFinance', 'ocean-words'] as const;

export const ALLOWED_EXACT_REPOS = [
  '4nrry/opencherry',
  '4nrry/homebrew-tap',
  '4nrry/4nrry.dev',
  'akitaonrails/ai-usagebar',
  'Andycodeman/samsung-galaxy-book-linux-fixes',
  'franceschinii/temakuri-frontend',
  'franceschinii/temakuri-backend',
] as const;

export interface OrgMeta {
  displayName: string;
  narrative: string;
  accent: string;
}

export const ORG_META: Record<(typeof ALLOWED_ORG_OWNERS)[number], OrgMeta> = {
  'smart-compost': {
    displayName: 'Smart Compost',
    narrative:
      'Where my career started, as the only engineer. Today it is a complete IoT composting platform: C++ sensor firmware, a fleet of NestJS microservices, three web frontends, a React Native app and Helm-managed infrastructure. Along the way I mentored an intern, Bruno, who now works at my level.',
    accent: '#4ade80',
  },
  LOTVSFinance: {
    displayName: 'LOTVS Finance',
    narrative:
      'A fintech I started with a college friend. TypeScript end to end: NestJS backend, React frontend and landing page. My single most PR-heavy repository lives here.',
    accent: '#60a5fa',
  },
  'ocean-words': {
    displayName: 'Ocean Words',
    narrative:
      'An English-teaching platform I build with my girlfriend, who teaches the classes. She brings the pedagogy, I bring the TypeScript.',
    accent: '#22d3ee',
  },
};

export interface ShowcaseMeta {
  title: string;
  repos: string[];
  blurb: string;
  url: string;
  tech: string[];
  npmPackage?: string;
  /** GraphQL alias of the live stargazer lookup, filled by queries.ts. */
  wantStars?: boolean;
  /** Count merged upstream PRs for this repo via search. */
  wantUpstreamPrs?: boolean;
}

export const SHOWCASE: ShowcaseMeta[] = [
  {
    title: 'OpenCherry',
    repos: ['4nrry/opencherry'],
    blurb:
      'My open-source flagship: a developer tool written in TypeScript and Rust, with an Astro site and its own Homebrew tap.',
    url: 'https://opencherry.dev',
    tech: ['TypeScript', 'Rust', 'Astro'],
    wantStars: true,
  },
  {
    title: 'ai-usagebar',
    repos: ['akitaonrails/ai-usagebar'],
    blurb:
      'Upstream contributions to Akita’s Rust waybar widget for AI usage tracking. The same author whose github-visualize inspired this site.',
    url: 'https://github.com/akitaonrails/ai-usagebar',
    tech: ['Rust'],
    wantUpstreamPrs: true,
  },
  {
    title: 'samsung-galaxy-book-linux-fixes',
    repos: ['Andycodeman/samsung-galaxy-book-linux-fixes'],
    blurb:
      'Community Linux fixes for Samsung Galaxy Books. I daily-drive a Book4 Ultra on Ubuntu and sent the fix that autostarts the webcam tray tooling.',
    url: 'https://github.com/Andycodeman/samsung-galaxy-book-linux-fixes',
    tech: ['Shell', 'Linux'],
    wantStars: true,
    wantUpstreamPrs: true,
  },
  {
    title: 'Temakuri',
    repos: ['franceschinii/temakuri-frontend', 'franceschinii/temakuri-backend'],
    blurb:
      'A multiplayer web card game built with my friend André, who open-sourced it. I shipped across both halves: React 19 + Socket.IO on the front, NestJS 11 + Prisma on the back.',
    url: 'https://github.com/franceschinii/temakuri-frontend',
    tech: ['React 19', 'Socket.IO', 'NestJS 11', 'Prisma'],
  },
  {
    title: '@smart-compost/mcp',
    repos: ['smart-compost/mcp'],
    blurb:
      'The public MCP server for the Smart Compost platform API, published on npm. LLMs talk to composting telemetry through it.',
    url: 'https://www.npmjs.com/package/@smart-compost/mcp',
    tech: ['JavaScript', 'MCP'],
    npmPackage: '@smart-compost/mcp',
    wantStars: true,
  },
];
