/**
 * Document-space geometry for the journey layer. Hard rule: every DOM read
 * (rects, computed styles, SVG CTMs) happens inside the batched recompute
 * pass; the per-frame path only consumes cached values.
 */

export interface DocRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export interface DocPoint {
  x: number;
  y: number;
}

export function toDocRect(rect: DOMRect, scrollY: number, scrollX: number): DocRect {
  return {
    top: rect.top + scrollY,
    bottom: rect.bottom + scrollY,
    left: rect.left + scrollX,
    right: rect.right + scrollX,
    width: rect.width,
    height: rect.height,
  };
}

/** One batched read pass. Constructed at recompute time only. */
export class MeasureBatch {
  readonly scrollY: number;
  readonly scrollX: number;
  readonly vpW: number;
  readonly vpH: number;
  readonly docHeight: number;

  constructor() {
    this.scrollY = window.scrollY;
    this.scrollX = window.scrollX;
    this.vpW = window.innerWidth;
    this.vpH = window.innerHeight;
    this.docHeight = document.documentElement.scrollHeight;
  }

  rect(element: Element): DocRect {
    return toDocRect(element.getBoundingClientRect(), this.scrollY, this.scrollX);
  }

  cssVar(element: Element, name: string): string {
    return getComputedStyle(element).getPropertyValue(name).trim();
  }
}

/** Path-local samples taken ONCE per path (the SVGs are static markup). */
export interface SampledPath {
  samples: Float32Array; // x,y interleaved, path-local coords
  total: number;
}

const SAMPLE_STEP = 6;
const sampleCache = new WeakMap<SVGPathElement, SampledPath>();

export function samplePath(path: SVGPathElement): SampledPath {
  const cached = sampleCache.get(path);
  if (cached) return cached;
  const total = path.getTotalLength();
  const count = Math.max(2, Math.ceil(total / SAMPLE_STEP) + 1);
  const samples = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const point = path.getPointAtLength((total * i) / (count - 1));
    samples[i * 2] = point.x;
    samples[i * 2 + 1] = point.y;
  }
  const sampled = { samples, total };
  sampleCache.set(path, sampled);
  return sampled;
}

/**
 * Screen CTM folded into document space. Captured at recompute; encodes
 * viewBox scaling, responsive width and the overflow wrapper's scrollLeft.
 */
export function docMatrix(svg: SVGGraphicsElement, batch: MeasureBatch): DOMMatrix | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  return new DOMMatrix().translate(batch.scrollX, batch.scrollY).multiply(ctm);
}

export function transformPoint(matrix: DOMMatrix, x: number, y: number): DocPoint {
  const point = matrix.transformPoint(new DOMPoint(x, y));
  return { x: point.x, y: point.y };
}

/** Point along a sampled path at distance ratio t (0..1), in doc space. */
export function pointOnPath(sampled: SampledPath, matrix: DOMMatrix, t: number): DocPoint {
  const clamped = Math.min(Math.max(t, 0), 1);
  const scaled = clamped * (sampled.samples.length / 2 - 1);
  const index = Math.min(Math.floor(scaled), sampled.samples.length / 2 - 2);
  const mix = scaled - index;
  const x = sampled.samples[index * 2]! + (sampled.samples[(index + 1) * 2]! - sampled.samples[index * 2]!) * mix;
  const y =
    sampled.samples[index * 2 + 1]! +
    (sampled.samples[(index + 1) * 2 + 1]! - sampled.samples[index * 2 + 1]!) * mix;
  return transformPoint(matrix, x, y);
}
