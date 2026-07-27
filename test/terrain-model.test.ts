import { describe, expect, it } from 'vitest';
import {
  buildTerrain,
  canvasHeightFor,
  emitFaces,
  FACE_NEAR,
  FACE_SIDE,
  FACE_TOP,
  ZERO_FLOOR,
} from '../src/scripts/terrain-model';

const DAY_MS = 86_400_000;

/** Ascending [date, count] pairs ending on `end`, mirroring the dataset shape. */
function calendarEndingAt(
  end: string,
  days: number,
  countFor: (index: number) => number,
): Array<[string, number]> {
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(endMs - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10);
    return [date, countFor(i)] as [string, number];
  });
}

function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

describe('buildTerrain', () => {
  // The live dataset window: 2024-07-25 .. 2026-07-25.
  const real = calendarEndingAt('2026-07-25', 731, (i) => (i % 5 === 0 ? 0 : (i % 17) + 1));

  it('trims two years down to a Monday-aligned 52-week window', () => {
    const model = buildTerrain(real, 52);

    expect(model.weeks).toBe(52);
    expect(model.columns.length).toBeLessThanOrEqual(52 * 7);
    expect(model.columns.length).toBeGreaterThan(51 * 7);
    expect(weekdayOf(model.columns[0]!.date)).toBe(0);
    expect(model.columns[0]!.week).toBe(0);
    expect(model.columns[0]!.weekday).toBe(0);
  });

  it('keeps the most recent day and drops only from the far end', () => {
    const model = buildTerrain(real, 52);
    expect(model.columns[model.columns.length - 1]!.date).toBe('2026-07-25');
  });

  it('derives grid coordinates from position, matching the real calendar dates', () => {
    const model = buildTerrain(real, 52);
    model.columns.forEach((column, i) => {
      expect(column.week).toBe(Math.floor(i / 7));
      expect(column.weekday).toBe(i % 7);
      expect(column.weekday).toBe(weekdayOf(column.date));
    });
  });

  it('narrows to 26 weeks for small viewports, still Monday-aligned', () => {
    const model = buildTerrain(real, 26);

    expect(model.weeks).toBe(26);
    expect(model.columns.length).toBeLessThanOrEqual(26 * 7);
    expect(weekdayOf(model.columns[0]!.date)).toBe(0);
  });

  it('floors empty days and tops out at the busiest one', () => {
    // The peak sits mid-window: the leading days can be trimmed by Monday-snapping.
    const calendar = calendarEndingAt('2026-07-25', 364, (i) => (i === 200 ? 165 : 0));
    const model = buildTerrain(calendar, 52);

    const busiest = model.columns.find((c) => c.count === 165)!;
    expect(busiest.norm).toBeCloseTo(1, 10);
    for (const column of model.columns) {
      if (column.count === 0) expect(column.norm).toBe(ZERO_FLOOR);
      expect(column.norm).toBeGreaterThanOrEqual(ZERO_FLOOR);
      expect(column.norm).toBeLessThanOrEqual(1);
    }
  });

  it('maps height logarithmically, not linearly', () => {
    // Median day (3) against a 165 max: linear would bury it at 0.018.
    const calendar = calendarEndingAt('2026-07-25', 364, (i) => (i === 200 ? 165 : 3));
    const model = buildTerrain(calendar, 52);

    const median = model.columns.find((c) => c.count === 3)!;
    expect(median.norm).toBeCloseTo(0.271, 2);
    expect(median.norm).toBeGreaterThan(10 * (3 / 165));
  });

  it('keeps norm monotonic in count', () => {
    const counts = [0, 1, 2, 5, 13, 40, 165];
    const calendar = calendarEndingAt('2026-07-25', 364, (i) => counts[i % counts.length]!);
    const model = buildTerrain(calendar, 52);

    const normFor = (count: number) => model.columns.find((c) => c.count === count)!.norm;
    for (let i = 1; i < counts.length; i++) {
      expect(normFor(counts[i]!)).toBeGreaterThan(normFor(counts[i - 1]!));
    }
  });

  it('survives degenerate input', () => {
    expect(buildTerrain([], 52)).toEqual({ columns: [], weeks: 0, maxCount: 0 });
    expect(buildTerrain([['2026-07-25', 4]], 0)).toEqual({ columns: [], weeks: 0, maxCount: 0 });

    // An all-zero calendar must not divide by log1p(0).
    const flat = buildTerrain(calendarEndingAt('2026-07-25', 364, () => 0), 52);
    expect(flat.maxCount).toBe(1);
    expect(flat.columns.every((c) => c.norm === ZERO_FLOOR)).toBe(true);
  });

  it('handles a calendar shorter than the requested window', () => {
    const short = calendarEndingAt('2026-07-25', 20, () => 4);
    const model = buildTerrain(short, 52);

    expect(model.columns.length).toBeLessThanOrEqual(20);
    expect(model.columns.length).toBeGreaterThan(13);
    expect(weekdayOf(model.columns[0]!.date)).toBe(0);
  });
});

const ELEVATION = (28 * Math.PI) / 180; // mirrors ELEVATION_RAD in terrain.ts
/** SWEEP_RAD + PARALLAX_AZIMUTH in terrain.ts — the widest the camera ever yaws. */
const MAX_YAW = (6 * Math.PI) / 180;

/** Vertical span the terrain actually covers on screen at a given yaw. */
function extent(
  model: ReturnType<typeof buildTerrain>,
  azimuth: number,
  width: number,
  height: number,
): { top: number; bottom: number } {
  let top = Infinity;
  let bottom = -Infinity;
  emitFaces(model, { azimuth, elevation: ELEVATION }, width, height, 1, (p) => {
    for (let i = 1; i < 8; i += 2) {
      top = Math.min(top, p[i]!);
      bottom = Math.max(bottom, p[i]!);
    }
  });
  return { top, bottom };
}

describe('canvasHeightFor', () => {
  it('scales inversely with weeks, so halving the columns halves the block', () => {
    // Screen scale is 0.92 * width / weeks: fewer columns means bigger pixels
    // per grid unit, and the canvas has to follow or the terrain overflows.
    expect(canvasHeightFor(976, 26)).toBeGreaterThan(canvasHeightFor(976, 52));
  });

  it('sizes the block for the widest yaw, not the resting pose', () => {
    // Two lessons, both learned the hard way. Yaw see-saws the terrain, so it
    // stands far taller at full sweep-plus-parallax than head-on: a box sized
    // for the resting pose clips the peaks the moment the pointer moves. And
    // the tallest column reaches highest when the record day lands on the far
    // weekday row — so sweeping the peak across every row matters, because
    // checking one fixed calendar passes on luck rather than on fit.
    for (const [width, weeks] of [
      [976, 52],
      [327, 26],
    ] as const) {
      const height = canvasHeightFor(width, weeks);
      let worstTop = Infinity;
      let worstBottom = Infinity;
      let bestFill = 0;

      for (let peak = 700; peak < 714; peak++) {
        const model = buildTerrain(
          calendarEndingAt('2026-07-25', 731, (i) => (i === peak ? 200 : (i % 7) + 1)),
          weeks,
        );
        for (const azimuth of [-MAX_YAW, 0, MAX_YAW]) {
          const { top, bottom } = extent(model, azimuth, width, height);
          worstTop = Math.min(worstTop, top);
          worstBottom = Math.min(worstBottom, height - bottom);
          bestFill = Math.max(bestFill, (bottom - top) / height);
        }
      }

      expect(worstTop).toBeGreaterThan(6);
      expect(worstBottom).toBeGreaterThan(6);
      // And it must not overshoot into wasted space at that extreme either.
      expect(bestFill).toBeGreaterThan(0.62);
    }
  });

  it('clamps to a sane block on absurd viewports', () => {
    expect(canvasHeightFor(4000, 52)).toBeLessThanOrEqual(260);
    expect(canvasHeightFor(120, 52)).toBeGreaterThanOrEqual(105);
  });
});

describe('emitFaces', () => {
  const DEG = Math.PI / 180;
  const W = 976;
  // The real production box, so the bounds checks below test what ships.
  const H = canvasHeightFor(W, 52);
  const model = buildTerrain(
    calendarEndingAt('2026-07-25', 731, (i) => (i % 5 === 0 ? 0 : (i % 17) + 1)),
    52,
  );

  interface Emitted {
    points: number[];
    kind: number;
    bucket: number;
    zero: boolean;
  }

  function collect(azimuth: number, entrance = 1): Emitted[] {
    const out: Emitted[] = [];
    emitFaces(model, { azimuth, elevation: 28 * DEG }, W, H, entrance, (p, kind, bucket, zero) => {
      out.push({ points: [...p], kind, bucket, zero });
    });
    return out;
  }

  const midY = (f: Emitted) => (f.points[1]! + f.points[3]! + f.points[5]! + f.points[7]!) / 4;
  const midX = (f: Emitted) => (f.points[0]! + f.points[2]! + f.points[4]! + f.points[6]!) / 4;

  it('emits near, side and top for every column', () => {
    const faces = collect(0);
    expect(faces.length).toBe(model.columns.length * 3);
    expect(faces.slice(0, 3).map((f) => f.kind)).toEqual([FACE_NEAR, FACE_SIDE, FACE_TOP]);
  });

  it('paints back to front, so the far weekday row lands first', () => {
    const faces = collect(0);
    const firstRow = faces.slice(0, 3 * model.weeks).map(midY);
    const lastRow = faces.slice(-3 * model.weeks).map(midY);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // Smaller y is higher on screen, which is where the far row belongs.
    expect(mean(firstRow)).toBeLessThan(mean(lastRow));
  });

  it('shows the x face the camera is actually on', () => {
    const [, leftSide] = collect(8 * DEG);
    const [nearAtLeft] = collect(8 * DEG);
    expect(midX(leftSide!)).toBeLessThan(midX(nearAtLeft!));

    const [, rightSide] = collect(-8 * DEG);
    const [nearAtRight] = collect(-8 * DEG);
    expect(midX(rightSide!)).toBeGreaterThan(midX(nearAtRight!));
  });

  it('starts flat: at entrance 0 every column has collapsed to the ground plane', () => {
    // The near face spans the column's height, so it degenerates to a line when
    // nothing has grown. The top face keeps its area — it is a ground-plane quad
    // seen at an angle, not a measure of height.
    for (const face of collect(0, 0)) {
      if (face.kind === FACE_TOP) continue;
      expect(face.points[1]!).toBeCloseTo(face.points[7]!, 6);
      expect(face.points[3]!).toBeCloseTo(face.points[5]!, 6);
    }
  });

  it('grows left to right, so mid-entrance the old weeks lead the recent ones', () => {
    const tops = collect(0, 0.5).filter((f) => f.kind === FACE_TOP);
    const rise = (f: Emitted) => -midY(f);
    const oldest = tops.slice(0, model.weeks).map(rise);
    const newest = tops.slice(-model.weeks).map(rise);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(oldest)).toBeGreaterThan(mean(newest));
  });

  it('keeps every face inside the canvas across the whole camera range', () => {
    for (const azimuth of [-MAX_YAW, 0, MAX_YAW]) {
      for (const face of collect(azimuth)) {
        for (let i = 0; i < 8; i += 2) {
          expect(face.points[i]!).toBeGreaterThan(-1);
          expect(face.points[i]!).toBeLessThan(W + 1);
          expect(face.points[i + 1]!).toBeGreaterThan(-1);
          expect(face.points[i + 1]!).toBeLessThan(H + 1);
        }
      }
    }
  });

  it('does nothing for an empty model', () => {
    let calls = 0;
    emitFaces({ columns: [], weeks: 0, maxCount: 0 }, { azimuth: 0, elevation: 0.5 }, W, H, 1, () => {
      calls++;
    });
    expect(calls).toBe(0);
  });
});
