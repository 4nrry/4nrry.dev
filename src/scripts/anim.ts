/**
 * Shared animation runtime. Every visualization implements a single contract:
 * `render(progress)` draws the chart at progress 0..1. Animated mode drives
 * progress through requestAnimationFrame; reduced-motion mode calls
 * `render(1)` once. Replay-on-scroll and the replay buttons reuse the same
 * contract.
 */

export interface Viz {
  render(progress: number): void;
  durationMs: number;
}

export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const integerFormat = new Intl.NumberFormat(
  typeof document !== 'undefined' && document.documentElement.lang === 'pt-BR' ? 'pt-BR' : 'en-US',
);

export function formatInt(value: number): string {
  return integerFormat.format(Math.round(value));
}

/**
 * DPR-correct canvas sizing. Returns a context scaled so drawing code works
 * in CSS pixels. Re-renders (at the last progress) when the element resizes.
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  cssHeight: number,
  onResize?: () => void,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas 2d context unavailable');
  const apply = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || canvas.parentElement?.clientWidth || 600;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.height = `${cssHeight}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  apply();
  const observer = new ResizeObserver(() => {
    apply();
    onResize?.();
  });
  observer.observe(canvas);
  return context;
}

export function cssWidth(canvas: HTMLCanvasElement): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return canvas.width / dpr;
}

/** Drives a viz once from 0 to 1; returns a cancel function. */
export function play(viz: Viz, onDone?: () => void): () => void {
  if (reducedMotion()) {
    viz.render(1);
    onDone?.();
    return () => {};
  }
  let raf = 0;
  const start = performance.now();
  const frame = (nowMs: number) => {
    const t = Math.min((nowMs - start) / viz.durationMs, 1);
    viz.render(t);
    if (t < 1) {
      raf = requestAnimationFrame(frame);
    } else {
      onDone?.();
    }
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/**
 * Plays the viz when the element scrolls into view (once), and again whenever
 * the optional replay button is pressed.
 */
export function playOnView(element: Element, viz: Viz, replayButton?: HTMLElement | null): void {
  let cancel: (() => void) | null = null;
  viz.render(reducedMotion() ? 1 : 0);
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          cancel?.();
          cancel = play(viz);
          observer.disconnect();
        }
      }
    },
    { threshold: 0.35 },
  );
  observer.observe(element);
  replayButton?.addEventListener('click', () => {
    cancel?.();
    cancel = play(viz);
  });
}

/** Amber heat ramp: one hue, lightness-monotonic, for magnitude encodings. */
const HEAT_STOPS = ['#26170a', '#78350f', '#b45309', '#d97706', '#f59e0b', '#fbbf24', '#fde68a'];
export const HEAT_ZERO = '#131316';

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function heatColor(t: number): string {
  if (t <= 0) return HEAT_ZERO;
  const clamped = Math.min(Math.max(t, 0), 1);
  const scaled = clamped * (HEAT_STOPS.length - 1);
  const index = Math.min(Math.floor(scaled), HEAT_STOPS.length - 2);
  const mix = scaled - index;
  const [r1, g1, b1] = hexToRgb(HEAT_STOPS[index]!);
  const [r2, g2, b2] = hexToRgb(HEAT_STOPS[index + 1]!);
  return `rgb(${Math.round(r1 + (r2 - r1) * mix)} ${Math.round(g1 + (g2 - g1) * mix)} ${Math.round(
    b1 + (b2 - b1) * mix,
  )})`;
}

export function themeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** One shared tooltip element for all canvas charts. */
let tooltip: HTMLDivElement | null = null;

function ensureTooltip(): HTMLDivElement {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'viz-tooltip';
    tooltip.setAttribute('role', 'status');
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

export function attachTooltip(
  canvas: HTMLCanvasElement,
  resolve: (x: number, y: number) => string | null,
): void {
  const element = ensureTooltip();
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const label = resolve(event.clientX - rect.left, event.clientY - rect.top);
    if (!label) {
      element.dataset.show = 'false';
      return;
    }
    element.textContent = label;
    element.dataset.show = 'true';
    const margin = 12;
    let left = event.clientX + margin;
    let top = event.clientY + margin;
    const { width, height } = element.getBoundingClientRect();
    if (left + width > window.innerWidth - 8) left = event.clientX - width - margin;
    if (top + height > window.innerHeight - 8) top = event.clientY - height - margin;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  });
  canvas.addEventListener('pointerleave', () => {
    element.dataset.show = 'false';
  });
}
