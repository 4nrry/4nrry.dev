import type { PortfolioDataset } from '../../shared/schema';
import { mountTerrain } from './terrain';
import { wireThemeToggle } from './theme';

/**
 * Entrance reveals. Arming the document from JS keeps the page fully readable
 * when scripts fail: the hiding rule is scoped to `data-reveal-armed`.
 * Everything already on screen at load reveals immediately, so nothing above
 * the fold waits on a scroll that may never come.
 */
function wireReveals(): void {
  const targets = [...document.querySelectorAll<HTMLElement>('.reveal')];
  if (!targets.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.documentElement.setAttribute('data-reveal-armed', '');

  // Stagger runs per group, so cards in a row cascade instead of landing together.
  for (const group of document.querySelectorAll<HTMLElement>('[data-reveal-group]')) {
    [...group.querySelectorAll<HTMLElement>('.reveal')].forEach((el, i) => {
      el.style.setProperty('--reveal-delay', `${i * 90}ms`);
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );

  for (const target of targets) observer.observe(target);
}

/** Counts a proof number up once it is on screen; the value is already known. */
function countUp(element: HTMLElement, value: number): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = nf.format(value);
    return;
  }
  const duration = 900;
  const start = performance.now();
  const frame = (now: number) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    element.textContent = nf.format(Math.round(value * eased));
    if (t < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function wireCountUp(element: HTMLElement, value: number): void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        countUp(element, value);
        observer.disconnect();
      }
    },
    { threshold: 0.4 },
  );
  observer.observe(element);
}

// Live proof numbers on the commercial home. The HTML ships with static
// fallbacks, so this only upgrades them when the dataset is reachable.
const nf = new Intl.NumberFormat('pt-BR');

/**
 * One request, two consumers: the proof numbers and the terrain below them read
 * the same payload. A cold KV answers 503, which resolves to null and leaves
 * every static fallback in place.
 */
let pending: Promise<PortfolioDataset | null> | null = null;

function dataset(): Promise<PortfolioDataset | null> {
  pending ??= fetch('/api/portfolio.json')
    .then((res) => (res.ok ? (res.json() as Promise<PortfolioDataset>) : null))
    .catch(() => null);
  return pending;
}

async function bootProofNumbers(): Promise<void> {
  const data = await dataset();
  if (!data) return;
  const values: Record<string, number | undefined> = {
    contributions: data.totals?.contributions,
    prs: data.totals?.prsAuthored,
    repos: data.totals?.reposContributed,
  };
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'number') continue;
    const el = document.querySelector<HTMLElement>(`[data-proof="${key}"]`);
    if (el) wireCountUp(el, value);
  }
}

function bootTerrain(): void {
  const figure = document.querySelector<HTMLElement>('[data-terrain]');
  if (!figure) return;
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  mountTerrain(figure, dataset);
}

wireThemeToggle();
wireReveals();
void bootProofNumbers();
bootTerrain();
