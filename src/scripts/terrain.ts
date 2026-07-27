/**
 * Contribution terrain: the GitHub calendar extruded into columns and projected
 * by hand into Canvas 2D. There is no 3D library here on purpose — the site's
 * visual language has no gradients, shadows or lights, so the scene reduces to
 * flat-shaded axis-aligned prisms, which is what a software projector draws
 * natively at a fraction of the weight.
 *
 * The camera sweeps rather than orbits: a full rotation would periodically
 * render the year right-to-left, and chronology is the whole point.
 *
 * Geometry lives in terrain-model.ts; this file is canvas plumbing and lifecycle.
 */

import type { PortfolioDataset } from '../../shared/schema';
import { cssWidth, heatColor, HEAT_ZERO, setupCanvas } from './anim';
import {
  BUCKETS,
  buildTerrain,
  type Camera,
  canvasHeightFor,
  emitFaces,
  type FaceKind,
  type TerrainModel,
} from './terrain-model';

const ENTRANCE_MS = 1200;
const SWEEP_MS = 24_000;
/**
 * Small on purpose: the grid is 52 long and 7 deep, so yaw see-saws the far end
 * vertically. Level is by far the most legible framing, so the idle sweep stays
 * near it and leaves the rest of the range to the pointer.
 *
 * Sweep and parallax add up, and their sum is what sizes the block: at full yaw
 * the terrain stands ~35% taller on screen than at rest. Raising either angle
 * means raising canvasHeightFor to match, or the peaks clip.
 */
const SWEEP_RAD = (3 * Math.PI) / 180;
const ELEVATION_RAD = (28 * Math.PI) / 180;
const ELEVATION_AMP = (2 * Math.PI) / 180;
const PARALLAX_AZIMUTH = (3 * Math.PI) / 180;
const PARALLAX_ELEVATION = (3 * Math.PI) / 180;
/** Per-frame approach rate toward the pointer target. Never snap. */
const DAMPING = 0.06;
const FRAME_MS = 1000 / 30;

const NARROW_BREAKPOINT = 640;
const weeksForViewport = () => (window.innerWidth < NARROW_BREAKPOINT ? 26 : 52);

type Rgb = [number, number, number];

function toRgb(color: string): Rgb {
  if (color.startsWith('#')) {
    const value = parseInt(color.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const parts = color.match(/\d+/g) ?? ['0', '0', '0'];
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

function shade([r, g, b]: Rgb, factor: number): string {
  return `rgb(${Math.round(r * factor)} ${Math.round(g * factor)} ${Math.round(b * factor)})`;
}

/** Light reads as coming from above: top full, near face dimmed, side dimmest. */
const FACE_FACTOR = [1, 0.85, 0.7];

/**
 * Fills indexed by [face kind][bucket], resolved once per theme flip. Asking
 * heatColor for a color per face per frame would be thousands of string builds
 * a second for a palette that only changes when the theme does.
 */
export type Palette = [string[], string[], string[]];

export function buildPalette(): { heat: Palette; zero: [string, string, string] } {
  const heat: Palette = [[], [], []];
  for (let i = 0; i < BUCKETS; i++) {
    const rgb = toRgb(heatColor(i / (BUCKETS - 1)));
    for (let face = 0; face < 3; face++) heat[face]!.push(shade(rgb, FACE_FACTOR[face]!));
  }
  const zeroRgb = toRgb(HEAT_ZERO);
  return {
    heat,
    zero: [
      shade(zeroRgb, FACE_FACTOR[0]!),
      shade(zeroRgb, FACE_FACTOR[1]!),
      shade(zeroRgb, FACE_FACTOR[2]!),
    ],
  };
}

export function mountTerrain(
  figure: HTMLElement,
  getDataset: () => Promise<PortfolioDataset | null>,
): void {
  const canvas = figure.querySelector<HTMLCanvasElement>('canvas');
  if (!canvas) return;

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let context: CanvasRenderingContext2D | null = null;
  let model: TerrainModel | null = null;
  let palette = buildPalette();
  let weeks = weeksForViewport();
  let calendar: Array<[string, number]> = [];

  let raf = 0;
  let elapsed = 0;
  let lastFrame = 0;
  let lastDraw = 0;
  let entrance = 0;
  let onScreen = false;
  let activated = false;

  const camera: Camera = { azimuth: 0, elevation: ELEVATION_RAD };
  const target: Camera = { azimuth: 0, elevation: 0 };

  function draw(): void {
    if (!context || !model) return;
    const ctx = context;
    const width = cssWidth(canvas!);
    const height = canvas!.clientHeight;
    ctx.clearRect(0, 0, width, height);

    emitFaces(model, camera, width, height, entrance, (p, kind: FaceKind, bucket, zero) => {
      ctx.beginPath();
      ctx.moveTo(p[0]!, p[1]!);
      ctx.lineTo(p[2]!, p[3]!);
      ctx.lineTo(p[4]!, p[5]!);
      ctx.lineTo(p[6]!, p[7]!);
      ctx.closePath();
      ctx.fillStyle = zero ? palette.zero[kind]! : palette.heat[kind]![bucket]!;
      ctx.fill();
    });
  }

  /** Rebuilds the model when the viewport crosses the narrow breakpoint. */
  function syncWeeks(): void {
    const next = weeksForViewport();
    if (next === weeks && model) return;
    weeks = next;
    if (calendar.length) model = buildTerrain(calendar, weeks);
  }

  /** Serves both resize and theme flip: setupCanvas registers it for both. */
  function repaint(): void {
    syncWeeks();
    palette = buildPalette();
    draw();
  }

  function frame(now: number): void {
    // Accumulating deltas rather than reading a start time keeps the camera from
    // jumping when a backgrounded tab comes back and rAF resumes.
    if (lastFrame) elapsed += Math.min(now - lastFrame, 100);
    lastFrame = now;

    if (now - lastDraw >= FRAME_MS - 1) {
      lastDraw = now;
      entrance = Math.min(elapsed / ENTRANCE_MS, 1);
      const sweep = (elapsed * 2 * Math.PI) / SWEEP_MS;
      camera.azimuth += (Math.sin(sweep) * SWEEP_RAD + target.azimuth - camera.azimuth) * DAMPING;
      camera.elevation +=
        (ELEVATION_RAD +
          Math.sin(sweep * 0.6) * ELEVATION_AMP +
          target.elevation -
          camera.elevation) *
        DAMPING;
      draw();
    }
    raf = requestAnimationFrame(frame);
  }

  function start(): void {
    if (raf || motion.matches || document.hidden || !model) return;
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop(): void {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  /** One finished frame, for reduced-motion visitors. */
  function still(): void {
    entrance = 1;
    camera.azimuth = 0;
    camera.elevation = ELEVATION_RAD;
    draw();
  }

  async function activate(): Promise<void> {
    const data = await getDataset();
    if (!data?.calendar?.length) return;

    calendar = data.calendar;
    // Unhide before measuring: a hidden element has no width for setupCanvas.
    figure.hidden = false;
    weeks = weeksForViewport();
    model = buildTerrain(calendar, weeks);
    // setupCanvas captures the height, so it is fixed for this mount. Crossing
    // the breakpoint later still reframes correctly: the projection is
    // width-bound, so the terrain shrinks inside the box rather than clipping.
    context = setupCanvas(canvas!, canvasHeightFor(figure.clientWidth || 976, weeks), repaint);

    if (motion.matches) still();
    else if (onScreen) start();
  }

  // Watch the section, never the figure. The figure ships `hidden`, and a
  // display:none element has no box, so it can never intersect the viewport —
  // observing it would wait forever for the very event that unhides it.
  const scrollTarget = figure.closest('section') ?? figure.parentElement ?? figure;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        onScreen = entry.isIntersecting;
        if (!activated && onScreen) {
          activated = true;
          void activate();
        } else if (onScreen) {
          start();
        } else {
          stop();
        }
      }
    },
    { rootMargin: '300px 0px' },
  );
  observer.observe(scrollTarget);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (onScreen) start();
  });

  motion.addEventListener('change', () => {
    if (motion.matches) {
      stop();
      still();
    } else if (onScreen) {
      start();
    }
  });

  // Pointer parallax, scoped to the figure: a window listener would fire on
  // every scroll of the page. Touch is skipped so it cannot fight scrolling.
  figure.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' || motion.matches) return;
    const rect = figure.getBoundingClientRect();
    target.azimuth = ((event.clientX - rect.left) / rect.width - 0.5) * 2 * PARALLAX_AZIMUTH;
    target.elevation = ((event.clientY - rect.top) / rect.height - 0.5) * 2 * PARALLAX_ELEVATION;
  });
  figure.addEventListener('pointerleave', () => {
    target.azimuth = 0;
    target.elevation = 0;
  });

  window.addEventListener('pagehide', stop);
}
