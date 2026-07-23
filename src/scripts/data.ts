import { SCHEMA_VERSION, type PortfolioDataset } from '../../shared/schema';
import { formatInt, play, playOnView, reducedMotion, themeColor } from './anim';
import { createCalendarReplay } from './calendar-replay';
import { createLanguagesViz } from './languages-viz';
import { createRepoBars, type RepoBarRow } from './repo-bars';
import { createWeekdayHeatmap } from './weekday-heatmap';
import { createYearsRace } from './years-race';

const ORG_CSS_VARS: Record<string, string> = {
  'smart-compost': '--color-org-smart',
  LOTVSFinance: '--color-org-lotvs',
  'ocean-words': '--color-org-ocean',
};

const IS_PT = document.documentElement.lang === 'pt-BR';

const PT_MONTHS: Record<string, string> = {
  Jan: 'jan', Feb: 'fev', Mar: 'mar', Apr: 'abr', May: 'mai', Jun: 'jun',
  Jul: 'jul', Aug: 'ago', Sep: 'set', Oct: 'out', Nov: 'nov', Dec: 'dez',
};

/** Client-side strings for everything the dataset and canvases compose. */
const T = IS_PT
  ? {
      justNow: 'agora mesmo',
      minAgo: (m: number) => `${m} min atrás`,
      hoursAgo: (h: number) => `${h} h atrás`,
      daysAgo: (d: number) => `${d} dias atrás`,
      synced: (when: string) => `sincronizado ${when}`,
      firstSync: 'primeira sincronização em andamento, os números chegam já já',
      tickerWords: { ticker: 'contribuições', one: 'contribuição', many: 'contribuições' },
      weekdayGutter: ['seg', '', 'qua', '', 'sex', '', ''],
      rowLabels: ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'],
      prsSuffix: 'PRs',
      reposSuffix: 'repos',
      topReposAria: 'Top repositórios por pull requests',
      upstreamPrs: (n: string) => `${n} PRs merged upstream`,
      onNpm: 'no npm',
      ariaCalendar: (n: string) => `Calendário diário de contribuições: ${n} contribuições nos últimos dois anos.`,
      ariaYears: (a: string, b: string) => `Contribuições por ano: ${a} e ${b}.`,
      ariaRepos: (n: number) => `Top ${n} repositórios por pull requests autorados.`,
      ariaWeekday: 'Contribuições por dia da semana em cada mês da janela.',
      ariaLanguages: (list: string) => `Linguagens: ${list}.`,
      translateMonth: (label: string) => {
        const [abbr, year] = label.split(' ');
        return `${PT_MONTHS[abbr ?? ''] ?? abbr} ${year ?? ''}`.trim();
      },
      pickNarrative: (org: { narrative: string; narrativePt?: string }) => org.narrativePt ?? org.narrative,
      pickBlurb: (card: { blurb: string; blurbPt?: string }) => card.blurbPt ?? card.blurb,
    }
  : {
      justNow: 'just now',
      minAgo: (m: number) => `${m} min ago`,
      hoursAgo: (h: number) => `${h} h ago`,
      daysAgo: (d: number) => `${d} days ago`,
      synced: (when: string) => `synced ${when}`,
      firstSync: 'first sync in progress, numbers land shortly',
      tickerWords: { ticker: 'contributions', one: 'contribution', many: 'contributions' },
      weekdayGutter: ['Mon', '', 'Wed', '', 'Fri', '', ''],
      rowLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      prsSuffix: 'PRs',
      reposSuffix: 'repos',
      topReposAria: 'Top repositories by pull requests',
      upstreamPrs: (n: string) => `${n} merged upstream PRs`,
      onNpm: 'on npm',
      ariaCalendar: (n: string) => `Daily contribution calendar: ${n} contributions over the last two years.`,
      ariaYears: (a: string, b: string) => `Yearly contributions: ${a} and ${b}.`,
      ariaRepos: (n: number) => `Top ${n} repositories by authored pull requests.`,
      ariaWeekday: 'Contributions by weekday across each month of the window.',
      ariaLanguages: (list: string) => `Language footprint: ${list}.`,
      translateMonth: (label: string) => label,
      pickNarrative: (org: { narrative: string; narrativePt?: string }) => org.narrative,
      pickBlurb: (card: { blurb: string; blurbPt?: string }) => card.blurb,
    };

async function fetchPortfolio(): Promise<PortfolioDataset | null> {
  try {
    const response = await fetch('/api/portfolio.json');
    if (!response.ok) return null;
    const data = (await response.json()) as PortfolioDataset;
    if (data.schemaVersion !== SCHEMA_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 90) return T.justNow;
  const minutes = seconds / 60;
  if (minutes < 90) return T.minAgo(Math.round(minutes));
  const hours = minutes / 60;
  if (hours < 36) return T.hoursAgo(Math.round(hours));
  return T.daysAgo(Math.round(hours / 24));
}

function setField(name: string, value: string): void {
  for (const element of document.querySelectorAll<HTMLElement>(`[data-field="${name}"]`)) {
    element.textContent = value;
  }
}

/** The language toggle stores the choice so geo never overrides it again. */
function wireLangToggle(): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[data-lang]')) {
    link.addEventListener('click', () => {
      document.cookie = `lang=${link.dataset.lang}; path=/; max-age=31536000; samesite=lax`;
    });
  }
}

function bootHero(data: PortfolioDataset, monthLabels: string[]): void {
  const canvas = byId<HTMLCanvasElement>('viz-calendar');
  const contributions = byId('counter-contributions');
  const prsMerged = byId('counter-prs');
  const streak = byId('counter-streak');
  if (!canvas || !contributions || !prsMerged || !streak) return;

  const viz = createCalendarReplay(canvas, {
    calendar: data.calendar,
    monthLabels,
    monthlyTotals: data.monthlyTotals,
    counters: {
      contributions: { element: contributions, target: data.totals.contributions },
      prsMerged: { element: prsMerged, target: data.totals.prsMerged },
      streak: { element: streak, target: data.streaks.longest },
    },
    ticker: byId('calendar-ticker'),
    words: T.tickerWords,
    weekdayGutter: T.weekdayGutter,
  });
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', T.ariaCalendar(formatInt(data.totals.contributions)));
  viz.render(reducedMotion() ? 1 : 0);
  // The hero replays on load: the page opens on its thesis. If the tab is in
  // the background, hold the replay until it becomes visible so the animation
  // is seen instead of skipped.
  const startHero = () => window.setTimeout(() => play(viz), 350);
  if (document.visibilityState === 'visible') {
    startHero();
  } else {
    const once = () => {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', once);
        startHero();
      }
    };
    document.addEventListener('visibilitychange', once);
  }
  byId('replay-hero')?.addEventListener('click', () => play(viz));

  const monthsBody = byId('table-months-body');
  if (monthsBody) {
    monthsBody.innerHTML = monthLabels
      .map((label, i) => `<tr><td>${label}</td><td>${formatInt(data.monthlyTotals[i] ?? 0)}</td></tr>`)
      .join('');
  }
}

function bootYears(data: PortfolioDataset): void {
  const canvas = byId<HTMLCanvasElement>('viz-years');
  const section = byId('section-jump');
  if (!canvas || !section || data.years.length < 2) return;
  const first = data.years[0]!;
  const last = data.years[data.years.length - 1]!;
  const multiplier = first.contributions > 0 ? last.contributions / first.contributions : 0;
  setField('multiplier', `${(Math.round(multiplier * 10) / 10).toFixed(1)}x`);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    T.ariaYears(
      `${first.label} ${formatInt(first.contributions)}`,
      `${last.label} ${formatInt(last.contributions)}`,
    ),
  );
  playOnView(section, createYearsRace(canvas, data.years));
}

function bootOrgs(data: PortfolioDataset): void {
  const grid = byId('orgs-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const org of data.orgs) {
    const accentVar = ORG_CSS_VARS[org.login] ?? '--color-muted';
    const card = document.createElement('article');
    card.className = 'card p-6 flex flex-col gap-4 org-card';
    card.style.setProperty('--org-accent', `var(${accentVar})`);
    const topRepoMax = Math.max(1, ...org.topRepos.map((r) => r.prs));
    card.innerHTML = `
      <header class="flex items-baseline justify-between gap-3">
        <h3 class="font-mono text-lg font-bold" style="color: var(--org-accent)">${org.displayName}</h3>
        <p class="font-mono text-xs text-faint">${formatInt(org.prCount)} ${T.prsSuffix} · ${formatInt(org.repoCount)} ${T.reposSuffix}</p>
      </header>
      <p class="text-sm leading-relaxed text-muted">${T.pickNarrative(org)}</p>
      <ul class="mt-auto flex flex-col gap-2" aria-label="${T.topReposAria}">
        ${org.topRepos
          .slice(0, 4)
          .map(
            (repo) => `
          <li class="font-mono text-xs">
            <div class="flex justify-between gap-2 text-muted">
              <span>${repo.name}</span><span class="text-text font-bold">${formatInt(repo.prs)}</span>
            </div>
            <div class="mt-1 h-1.5 rounded-full bg-card-deep overflow-hidden">
              <div class="org-bar h-full rounded-full" style="--w: ${Math.round((repo.prs / topRepoMax) * 100)}%; background: var(--org-accent)"></div>
            </div>
          </li>`,
          )
          .join('')}
      </ul>`;
    grid.appendChild(card);
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.3 },
  );
  for (const card of grid.children) observer.observe(card);
}

function bootRepoBars(data: PortfolioDataset): void {
  const canvas = byId<HTMLCanvasElement>('viz-repos');
  const section = byId('section-repos');
  if (!canvas || !section) return;
  const rows: RepoBarRow[] = data.orgs
    .flatMap((org) =>
      org.topRepos.map((repo) => ({
        name: repo.name,
        prs: repo.prs,
        orgName: org.displayName,
        accent: themeColor(ORG_CSS_VARS[org.login] ?? '--color-muted'),
      })),
    )
    .sort((a, b) => b.prs - a.prs)
    .slice(0, 10);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', T.ariaRepos(rows.length));
  playOnView(section, createRepoBars(canvas, rows));

  const tableBody = byId('table-repos-body');
  if (tableBody) {
    tableBody.innerHTML = rows
      .map((row) => `<tr><td>${row.name}</td><td>${row.orgName}</td><td>${formatInt(row.prs)}</td></tr>`)
      .join('');
  }
}

function bootWeekday(data: PortfolioDataset, monthLabels: string[]): void {
  const canvas = byId<HTMLCanvasElement>('viz-weekday');
  const section = byId('section-rhythm');
  if (!canvas || !section) return;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', T.ariaWeekday);
  playOnView(
    section,
    createWeekdayHeatmap(canvas, data.weekdayByMonth, monthLabels, T.rowLabels, T.tickerWords.many),
  );
}

function bootLanguages(data: PortfolioDataset): void {
  const canvas = byId<HTMLCanvasElement>('viz-languages');
  const section = byId('section-languages');
  const list = byId('languages-list');
  if (!canvas || !section) return;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    T.ariaLanguages(data.languages.map((l) => `${l.name} ${l.pct}%`).join(', ')),
  );
  playOnView(section, createLanguagesViz(canvas, data.languages));
  if (list) {
    list.innerHTML = data.languages
      .map(
        (language) => `
        <li class="flex items-center gap-2 font-mono text-xs text-muted">
          <span class="inline-block h-2.5 w-2.5 rounded-sm" style="background: ${language.color ?? '#52525b'}"></span>
          ${language.name} <span class="text-faint">${language.pct}%</span>
        </li>`,
      )
      .join('');
  }
}

function bootOpenSource(data: PortfolioDataset): void {
  const grid = byId('oss-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const card of data.openSource) {
    const badges: string[] = [];
    if (typeof card.stars === 'number') badges.push(`★ ${formatInt(card.stars)}`);
    if (typeof card.upstreamMergedPrs === 'number' && card.upstreamMergedPrs > 0) {
      badges.push(T.upstreamPrs(formatInt(card.upstreamMergedPrs)));
    }
    if (card.npmPackage) badges.push(T.onNpm);
    const article = document.createElement('article');
    article.className = 'card p-6 flex flex-col gap-3';
    article.innerHTML = `
      <header class="flex items-baseline justify-between gap-3">
        <h3 class="font-mono text-base font-bold">
          <a class="hover:text-accent-bright transition-colors" href="${card.url}" rel="noopener">${card.title}</a>
        </h3>
        ${badges.length ? `<p class="font-mono text-xs text-accent">${badges.join(' · ')}</p>` : ''}
      </header>
      <p class="text-sm leading-relaxed text-muted">${T.pickBlurb(card)}</p>
      <footer class="mt-auto flex flex-wrap items-center gap-2">
        ${card.tech.map((tech) => `<span class="font-mono text-[0.65rem] text-faint border border-border rounded px-1.5 py-0.5">${tech}</span>`).join('')}
        <span class="flex-1"></span>
        ${card.repos
          .map(
            (repo) =>
              `<a class="font-mono text-[0.65rem] text-faint hover:text-muted underline underline-offset-2" href="https://github.com/${repo}" rel="noopener">${repo}</a>`,
          )
          .join('')}
      </footer>`;
    grid.appendChild(article);
  }
}

async function boot(): Promise<void> {
  wireLangToggle();
  const data = await fetchPortfolio();
  const syncChip = byId('sync-chip');
  if (!data) {
    if (syncChip) syncChip.textContent = T.firstSync;
    window.setTimeout(boot, 45_000);
    return;
  }
  document.body.dataset.pending = 'false';
  if (syncChip) syncChip.textContent = T.synced(relativeTime(data.generatedAt));

  const monthLabels = data.monthLabels.map(T.translateMonth);

  setField('totals.contributions', formatInt(data.totals.contributions));
  setField('totals.prsAuthored', formatInt(data.totals.prsAuthored));
  setField('totals.prsMerged', formatInt(data.totals.prsMerged));
  setField('streaks.longest', formatInt(data.streaks.longest));
  setField('totals.reposContributed', formatInt(data.totals.reposContributed));

  bootHero(data, monthLabels);
  bootYears(data);
  bootOrgs(data);
  bootRepoBars(data);
  bootWeekday(data, monthLabels);
  bootLanguages(data);
  bootOpenSource(data);
}

boot();
