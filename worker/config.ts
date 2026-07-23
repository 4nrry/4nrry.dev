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
  narrativePt: string;
  accent: string;
}

export const ORG_META: Record<(typeof ALLOWED_ORG_OWNERS)[number], OrgMeta> = {
  'smart-compost': {
    displayName: 'Smart Compost',
    narrative:
      'Where my career started, as the only engineer. Today it is a complete IoT composting platform: C++ sensor firmware, a fleet of NestJS microservices, three web frontends, a React Native app and Helm-managed infrastructure. Along the way I mentored an intern, Bruno, who now works at my level.',
    narrativePt:
      'Onde minha carreira começou, como o único engenheiro. Hoje é uma plataforma completa de compostagem IoT: firmware C++ nos sensores, uma frota de microservices NestJS, três frontends web, um app React Native e infraestrutura gerenciada com Helm. No caminho, mentorei um estagiário, o Bruno, que hoje trabalha no meu nível.',
    accent: '#4ade80',
  },
  LOTVSFinance: {
    displayName: 'LOTVS Finance',
    narrative:
      'A fintech I started with a college friend. TypeScript end to end: NestJS backend, React frontend and landing page. My single most PR-heavy repository lives here.',
    narrativePt:
      'Uma fintech que comecei com um amigo de faculdade. TypeScript de ponta a ponta: backend NestJS, frontend React e landing page. Meu repositório mais pesado em PRs vive aqui.',
    accent: '#60a5fa',
  },
  'ocean-words': {
    displayName: 'Ocean Words',
    narrative:
      'An English-teaching platform I build with my girlfriend, who teaches the classes. She brings the pedagogy, I bring the TypeScript.',
    narrativePt:
      'Uma plataforma de ensino de inglês que construo com minha namorada, que dá as aulas. Ela entra com a pedagogia, eu com o TypeScript.',
    accent: '#22d3ee',
  },
};

export interface ShowcaseMeta {
  title: string;
  repos: string[];
  blurb: string;
  blurbPt: string;
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
      'My open-source flagship: a multi-repo control tower for AI coding agents. Tauri 2 desktop app with a Rust core and SolidJS UI, offline-first.',
    blurbPt:
      'Meu flagship open source: uma torre de controle multi-repo pra agentes de IA. App desktop Tauri 2 com core Rust e UI SolidJS, offline-first.',
    url: 'https://opencherry.dev',
    tech: ['Rust', 'SolidJS', 'Tauri 2'],
    wantStars: true,
  },
  {
    title: 'ai-usagebar',
    repos: ['akitaonrails/ai-usagebar'],
    blurb:
      'Upstream contributions to Akita’s Rust waybar widget for AI usage tracking. The same author whose github-visualize inspired this site.',
    blurbPt:
      'Contribuições upstream pro widget Rust de waybar do Akita que monitora uso de IA. O mesmo autor cujo github-visualize inspirou este site.',
    url: 'https://github.com/akitaonrails/ai-usagebar',
    tech: ['Rust'],
    wantUpstreamPrs: true,
  },
  {
    title: 'samsung-galaxy-book-linux-fixes',
    repos: ['Andycodeman/samsung-galaxy-book-linux-fixes'],
    blurb:
      'Community Linux fixes for Samsung Galaxy Books. I daily-drive a Book4 Ultra on Ubuntu and sent the fix that autostarts the webcam tray tooling.',
    blurbPt:
      'Fixes comunitários de Linux pra Samsung Galaxy Books. Uso um Book4 Ultra com Ubuntu no dia a dia e mandei o fix que dá autostart no tray da webcam.',
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
    blurbPt:
      'Um jogo de cartas multiplayer web feito com meu amigo André, que abriu o código. Entreguei nas duas metades: React 19 + Socket.IO na frente, NestJS 11 + Prisma atrás.',
    url: 'https://github.com/franceschinii/temakuri-frontend',
    tech: ['React 19', 'Socket.IO', 'NestJS 11', 'Prisma'],
  },
  {
    title: '@smart-compost/mcp',
    repos: ['smart-compost/mcp'],
    blurb:
      'The public MCP server for the Smart Compost platform API, published on npm. LLMs talk to composting telemetry through it.',
    blurbPt:
      'O servidor MCP público da API da plataforma Smart Compost, publicado no npm. LLMs conversam com telemetria de compostagem através dele.',
    url: 'https://www.npmjs.com/package/@smart-compost/mcp',
    tech: ['JavaScript', 'MCP'],
    npmPackage: '@smart-compost/mcp',
    wantStars: true,
  },
];
