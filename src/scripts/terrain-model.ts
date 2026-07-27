/**
 * Geometry for the contribution terrain: the height model plus the hand-rolled
 * projection that turns it into screen-space faces. Pure and DOM-free, so the
 * whole visual result can be unit-tested in the node environment the worker
 * tests already use, and rendered offline without a browser.
 *
 * The height mapping is logarithmic for the same reason the calendar's color
 * ramp is: the real window has a non-zero median of 16 against a max of 165, so
 * linear heights would render one tower on an otherwise flat plain.
 */

export interface Column {
  /** Column index, 0 = leftmost (oldest) week. */
  week: number;
  /** 0 = Monday. */
  weekday: number;
  date: string;
  count: number;
  /** Height factor 0..1. */
  norm: number;
}

export interface TerrainModel {
  columns: Column[];
  weeks: number;
  maxCount: number;
}

/** Days with no contributions still occupy height, so the plain reads as ground. */
export const ZERO_FLOOR = 0.05;

function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Takes the trailing `weeks` weeks of the calendar, snapped forward so column 0
 * always starts on a Monday. The final column may be a partial week in progress.
 */
export function buildTerrain(calendar: Array<[string, number]>, weeks: number): TerrainModel {
  if (!calendar.length || weeks < 1) return { columns: [], weeks: 0, maxCount: 0 };

  let start = Math.max(0, calendar.length - weeks * 7);
  while (start < calendar.length && weekdayOf(calendar[start]![0]) !== 0) start++;

  const slice = calendar.slice(start);
  if (!slice.length) return { columns: [], weeks: 0, maxCount: 0 };

  const maxCount = Math.max(1, ...slice.map(([, count]) => count));
  const logMax = Math.log1p(maxCount);

  // The slice starts on a Monday, so the index alone gives both coordinates.
  const columns = slice.map(([date, count], i) => ({
    week: Math.floor(i / 7),
    weekday: i % 7,
    date,
    count,
    norm: count === 0 ? ZERO_FLOOR : Math.log1p(count) / logMax,
  }));

  return { columns, weeks: Math.ceil(slice.length / 7), maxCount };
}

/* ------------------------------------------------------------------ */
/* Projection                                                          */
/* ------------------------------------------------------------------ */

export interface Camera {
  azimuth: number;
  elevation: number;
}

/** Column footprint inside its 1x1 grid slot; the remainder is the gap. */
export const CELL = 0.86;
/** Tallest column, in grid units. Tuned so a peak reads about as tall as the
 *  slab is deep, which keeps the terrain legible instead of spiky. */
export const HEIGHT_SCALE = 3.7;
/**
 * Camera distance as a multiple of the grid width. Large on purpose: a short
 * distance across a 52-wide grid swings the far end off the top of the frame
 * when the sweep rotates, and blows the near columns up against the far ones.
 * This is nearly orthographic, which is the register the rest of the site is in.
 */
const CAMERA_DISTANCE = 4;
/**
 * Vertical placement of the grid origin. Tuned against the worst case rather
 * than today's data: the tallest column reaches highest when the record day
 * happens to fall on the far weekday row, and the next sync can move it there.
 */
const HORIZON = 0.655;
/** Fraction of the entrance the left-to-right growth wave is spread across. */
const WAVE_SPREAD = 0.55;

/** Magnitude buckets the color ramp is quantized into. */
export const BUCKETS = 24;

export const FACE_TOP = 0;
export const FACE_NEAR = 1;
export const FACE_SIDE = 2;
export type FaceKind = typeof FACE_TOP | typeof FACE_NEAR | typeof FACE_SIDE;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Screen scale is 0.92 * width / weeks, so halving the week count doubles the
 * pixels per grid unit. The canvas has to follow or the narrow layout renders
 * twice as tall and overflows.
 *
 * The factor is set by the widest camera angle, not by the resting pose. Yaw
 * see-saws the terrain — one end rises as the other drops — so at the full +-6
 * of sweep plus pointer parallax it stands about 35% taller than head-on. Size
 * the box for the resting pose and the peaks clip the moment the pointer moves.
 * Raising SWEEP_RAD or PARALLAX_AZIMUTH in terrain.ts means raising this too.
 */
export function canvasHeightFor(width: number, weeks: number): number {
  return Math.round(Math.min(260, Math.max(105, (9.11 * width) / weeks)));
}

/**
 * Walks the terrain back-to-front and hands each visible face to `emit` as four
 * screen-space points. The caller only picks a fill and traces the polygon.
 *
 * `points` is a single reusable buffer — the loop runs 30 times a second and
 * allocating a thousand arrays per frame would be pure GC pressure. Consumers
 * must read it before returning.
 */
export function emitFaces(
  model: TerrainModel,
  camera: Camera,
  width: number,
  height: number,
  entrance: number,
  emit: (points: Float64Array, kind: FaceKind, bucket: number, zero: boolean) => void,
): void {
  if (!model.columns.length) return;

  const cosA = Math.cos(camera.azimuth);
  const sinA = Math.sin(camera.azimuth);
  const cosE = Math.cos(camera.elevation);
  const sinE = Math.sin(camera.elevation);
  const distance = model.weeks * CAMERA_DISTANCE;
  const focal = 0.92 * width * CAMERA_DISTANCE;
  const centerX = width / 2;
  const centerY = height * HORIZON;

  const points = new Float64Array(8);

  // Rotate by azimuth (Y) then elevation (X), then divide through by depth.
  // Positive Z is far, and the elevation sign puts far points higher on screen.
  const project = (x: number, y: number, z: number, slot: number): void => {
    const rx = x * cosA - z * sinA;
    const rz = x * sinA + z * cosA;
    const k = focal / (rz * cosE - y * sinE + distance);
    points[slot] = centerX + rx * k;
    points[slot + 1] = centerY - (y * cosE + rz * sinE) * k;
  };

  const half = CELL / 2;
  const originX = (model.weeks - 1) / 2;
  // Painter's order: far rows first, and within a row the far end of the sweep
  // first. Both directions follow from the azimuth sign alone, so a grid-aligned
  // scene never needs a per-frame depth sort.
  const reversed = camera.azimuth > 0;
  const lastWeek = model.weeks - 1;

  for (let row = 6; row >= 0; row--) {
    for (let i = 0; i < model.weeks; i++) {
      const week = reversed ? lastWeek - i : i;
      const column = model.columns[week * 7 + row];
      if (!column) continue;

      const wave = lastWeek > 0 ? week / lastWeek : 0;
      const local = Math.min(Math.max((entrance - wave * WAVE_SPREAD) / (1 - WAVE_SPREAD), 0), 1);
      const top = column.norm * easeOutCubic(local) * HEIGHT_SCALE;

      const x = week - originX;
      const z = column.weekday - 3;
      const x0 = x - half;
      const x1 = x + half;
      const z0 = z - half;
      const z1 = z + half;
      const bucket = Math.min(BUCKETS - 1, Math.round(column.norm * (BUCKETS - 1)));
      const zero = column.count === 0;

      // The -z face always points at the camera; only one x face ever does.
      project(x0, top, z0, 0);
      project(x1, top, z0, 2);
      project(x1, 0, z0, 4);
      project(x0, 0, z0, 6);
      emit(points, FACE_NEAR, bucket, zero);

      const sideX = camera.azimuth < 0 ? x1 : x0;
      project(sideX, top, z0, 0);
      project(sideX, top, z1, 2);
      project(sideX, 0, z1, 4);
      project(sideX, 0, z0, 6);
      emit(points, FACE_SIDE, bucket, zero);

      project(x0, top, z0, 0);
      project(x1, top, z0, 2);
      project(x1, top, z1, 4);
      project(x0, top, z1, 6);
      emit(points, FACE_TOP, bucket, zero);
    }
  }
}
