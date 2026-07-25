/**
 * Theme switching. The system preference is the default; an explicit choice is
 * stored and wins until the visitor picks the other one back. The pre-paint
 * script in Layout.astro applies the stored value; this module owns everything
 * after that: the toggle, the browser chrome tint, and repainting canvases.
 */
import { onThemeChange } from './anim';

type Theme = 'light' | 'dark';

const KEY = 'theme';
const systemLight = () => window.matchMedia('(prefers-color-scheme: light)').matches;

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return stored() ?? (systemLight() ? 'light' : 'dark');
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  // Matching the system again means going back to following it, so that a
  // later change to the OS setting is picked up instead of being pinned.
  if ((theme === 'light') === systemLight()) {
    delete root.dataset.theme;
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* storage blocked; the attribute still reflects the choice */
    }
  } else {
    root.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* storage blocked; the choice lasts for this page only */
    }
  }
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#fafaf9' : '#09090b');
  syncButtons(theme);
  onThemeChange();
}

function syncButtons(theme: Theme): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
    button.setAttribute('aria-pressed', String(theme === 'light'));
    const label = theme === 'light' ? button.dataset.labelDark : button.dataset.labelLight;
    if (label) button.setAttribute('aria-label', label);
    button.title = label ?? '';
  }
}

export function wireThemeToggle(): void {
  syncButtons(currentTheme());

  for (const button of document.querySelectorAll<HTMLElement>('[data-theme-toggle]')) {
    button.addEventListener('click', () => {
      apply(currentTheme() === 'light' ? 'dark' : 'light');
    });
  }

  // Follow the OS while the visitor has not overridden it, even mid-session.
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (stored()) return;
    syncButtons(currentTheme());
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', systemLight() ? '#fafaf9' : '#09090b');
    onThemeChange();
  });
}
