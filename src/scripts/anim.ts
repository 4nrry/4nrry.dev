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

/** Canvases that must be repainted when the theme flips. See onThemeChange. */
const redrawers = new Set<() => void>();

function registerRedraw(redraw: () => void): void {
  redrawers.add(redraw);
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
 *
 * `cssHeight` may be a function of the current CSS width, for charts whose
 * proportions follow the width — the calendar and the weekday heatmap both
 * pick a cell size from the space they get. A frozen height was a real bug:
 * rotating a phone widened the terrain projection while the box stayed at the
 * portrait height, and the tall columns clipped.
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  cssHeight: number | ((cssWidth: number) => number),
  onResize?: () => void,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas 2d context unavailable');
  const measure = () => canvas.clientWidth || canvas.parentElement?.clientWidth || 600;
  let lastWidth = -1;
  const apply = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = measure();
    lastWidth = width;
    const height = typeof cssHeight === 'function' ? cssHeight(width) : cssHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  apply();
  // Width is the only input, and writing the height back would otherwise make
  // the observer re-fire on its own output.
  const observer = new ResizeObserver(() => {
    if (measure() === lastWidth) return;
    apply();
    onResize?.();
  });
  observer.observe(canvas);
  if (onResize) registerRedraw(onResize);
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

/**
 * Amber heat ramp: one hue, lightness-monotonic, for magnitude encodings.
 * The ramp runs away from the page surface, so it inverts with the theme:
 * dark rises to bright amber, light sinks to deep amber.
 */
const HEAT_DARK = ['#26170a', '#78350f', '#b45309', '#d97706', '#f59e0b', '#fbbf24', '#fde68a'];
const HEAT_LIGHT = ['#fef3c7', '#fde68a', '#fcd34d', '#f59e0b', '#d97706', '#b45309', '#78350f'];
const ZERO_DARK = '#131316';
const ZERO_LIGHT = '#e7e5e4';

function isLightTheme(): boolean {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'light') return true;
  if (forced === 'dark') return false;
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

// Resolved once per theme rather than per cell: a full calendar render asks for
// hundreds of colors.
let heatStops = HEAT_DARK;
export let HEAT_ZERO = ZERO_DARK;

function applyThemeConstants(): void {
  const light = isLightTheme();
  heatStops = light ? HEAT_LIGHT : HEAT_DARK;
  HEAT_ZERO = light ? ZERO_LIGHT : ZERO_DARK;
}

if (typeof document !== 'undefined') applyThemeConstants();

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function heatColor(t: number): string {
  if (t <= 0) return HEAT_ZERO;
  const clamped = Math.min(Math.max(t, 0), 1);
  const scaled = clamped * (heatStops.length - 1);
  const index = Math.min(Math.floor(scaled), heatStops.length - 2);
  const mix = scaled - index;
  const [r1, g1, b1] = hexToRgb(heatStops[index]!);
  const [r2, g2, b2] = hexToRgb(heatStops[index + 1]!);
  return `rgb(${Math.round(r1 + (r2 - r1) * mix)} ${Math.round(g1 + (g2 - g1) * mix)} ${Math.round(
    b1 + (b2 - b1) * mix,
  )})`;
}

/**
 * Repaints every canvas. Each one reuses the "redraw at the current progress"
 * callback it already hands to setupCanvas for resizes, so no visualization
 * module needs to know themes exist.
 */
export function onThemeChange(): void {
  applyThemeConstants();
  for (const redraw of redrawers) redraw();
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

/** Canvases with a tooltip, so one document-level listener can dismiss it. */
const tooltipCanvases = new Set<HTMLCanvasElement>();
let dismissWired = false;

function hideTooltip(): void {
  if (tooltip) tooltip.dataset.show = 'false';
}

/**
 * A tap anywhere that is not a charted canvas closes the tooltip, and so does
 * any scroll — the element is position:fixed, so it would otherwise hang in
 * place while the page moves under it. Wired once for every chart.
 */
function wireDismiss(): void {
  if (dismissWired) return;
  dismissWired = true;
  document.addEventListener('pointerdown', (event) => {
    if (!tooltipCanvases.has(event.target as HTMLCanvasElement)) hideTooltip();
  });
  window.addEventListener('scroll', hideTooltip, { passive: true });
}

export function attachTooltip(
  canvas: HTMLCanvasElement,
  resolve: (x: number, y: number) => string | null,
): void {
  const element = ensureTooltip();
  tooltipCanvases.add(canvas);
  wireDismiss();

  const labelAt = (event: PointerEvent): string | null => {
    const rect = canvas.getBoundingClientRect();
    return resolve(event.clientX - rect.left, event.clientY - rect.top);
  };

  /**
   * Positions the tooltip and then clamps it inside the viewport. The flip
   * alone was not enough: once the label is wider than the gap between the
   * pointer and the left edge — routine on a 320px screen, where a repo label
   * runs ~250px — the flipped position goes negative and the text is cut off
   * the other side.
   */
  const show = (label: string, clientX: number, clientY: number, above: boolean): void => {
    element.textContent = label;
    element.dataset.show = 'true';
    const margin = 12;
    const { width, height } = element.getBoundingClientRect();
    let left = clientX + margin;
    // Above the finger on touch: below it, the hand covers the cell being read.
    let top = above ? clientY - height - 24 : clientY + margin;
    if (left + width > window.innerWidth - 8) left = clientX - width - margin;
    if (!above && top + height > window.innerHeight - 8) top = clientY - height - margin;
    element.style.left = `${Math.min(Math.max(left, 8), Math.max(8, window.innerWidth - width - 8))}px`;
    element.style.top = `${Math.min(Math.max(top, 8), Math.max(8, window.innerHeight - height - 8))}px`;
  };

  canvas.addEventListener('pointermove', (event) => {
    // Touch is served by pointerdown below; a drag would drag the label along
    // under the finger instead of reading a cell.
    if (event.pointerType === 'touch') return;
    const label = labelAt(event);
    if (!label) return hideTooltip();
    show(label, event.clientX, event.clientY, false);
  });
  canvas.addEventListener('pointerleave', hideTooltip);

  // Touch has no hover, so a tap is the whole interaction. Without this the
  // charts carry no readout at all on a phone.
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    const label = labelAt(event);
    if (!label) return hideTooltip();
    show(label, event.clientX, event.clientY, true);
  });
  canvas.addEventListener('pointercancel', hideTooltip);
}
