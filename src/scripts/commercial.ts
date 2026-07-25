import { wireThemeToggle } from './theme';

// Live proof numbers on the commercial home. The HTML ships with static
// fallbacks, so this only upgrades them when the dataset is reachable.
const nf = new Intl.NumberFormat('pt-BR');

async function boot(): Promise<void> {
  try {
    const res = await fetch('/api/portfolio.json');
    if (!res.ok) return;
    const data = (await res.json()) as {
      totals?: { contributions?: number; prsAuthored?: number; reposContributed?: number };
    };
    const values: Record<string, number | undefined> = {
      contributions: data.totals?.contributions,
      prs: data.totals?.prsAuthored,
      repos: data.totals?.reposContributed,
    };
    for (const [key, value] of Object.entries(values)) {
      if (typeof value !== 'number') continue;
      const el = document.querySelector(`[data-proof="${key}"]`);
      if (el) el.textContent = nf.format(value);
    }
  } catch {
    // keep the static fallbacks
  }
}

wireThemeToggle();
void boot();
