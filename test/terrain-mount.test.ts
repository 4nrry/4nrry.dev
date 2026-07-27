/**
 * Lifecycle tests for mountTerrain. The DOM here is hand-rolled rather than
 * jsdom: the surface the terrain touches is small and explicit, and stubbing it
 * by hand keeps the repo dependency-free while covering the part that unit tests
 * of the pure geometry cannot reach.
 *
 * These exist because of a real regression: the observer used to watch the
 * figure itself, which ships `hidden`. A display:none element has no box and can
 * never intersect the viewport, so the terrain waited forever for the event that
 * would have unhidden it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Ctx {
  fills: number;
  fillStyle: string;
  setTransform(): void;
  clearRect(): void;
  beginPath(): void;
  moveTo(): void;
  lineTo(): void;
  closePath(): void;
  fill(): void;
}

function fakeContext(): Ctx {
  return {
    fills: 0,
    fillStyle: '',
    setTransform() {},
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill(this: Ctx) {
      this.fills++;
    },
  };
}

interface Harness {
  figure: Record<string, unknown>;
  section: Record<string, unknown>;
  ctx: Ctx;
  observed: unknown[];
  trigger: (isIntersecting: boolean) => void;
  pump: (frames: number) => void;
  pending: Array<(now: number) => void>;
  cancelled: number[];
}

let harness: Harness;

function install(options: { reducedMotion?: boolean } = {}): Harness {
  const ctx = fakeContext();
  const canvas = {
    width: 0,
    height: 0,
    clientWidth: 976,
    clientHeight: 206,
    style: {} as Record<string, string>,
    getContext: () => ctx,
    addEventListener() {},
  };
  const section = { tag: 'section' };
  const figure: Record<string, unknown> = {
    hidden: true,
    clientWidth: 976,
    querySelector: () => canvas,
    closest: (sel: string) => (sel === 'section' ? section : null),
    parentElement: section,
    addEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 976, height: 206 }),
  };

  const observed: unknown[] = [];
  let ioCallback: ((entries: unknown[]) => void) | null = null;
  const pending: Array<(now: number) => void> = [];
  const cancelled: number[] = [];
  let nextRaf = 1;

  class FakeIntersectionObserver {
    constructor(cb: (entries: unknown[]) => void) {
      ioCallback = cb;
    }
    observe(target: unknown) {
      observed.push(target);
    }
    disconnect() {}
    unobserve() {}
  }
  class FakeResizeObserver {
    observe() {}
    disconnect() {}
  }

  const globals = globalThis as unknown as Record<string, unknown>;
  globals.document = {
    hidden: false,
    documentElement: { dataset: {}, lang: 'pt-BR' },
    addEventListener() {},
  };
  globals.window = {
    innerWidth: 1280,
    devicePixelRatio: 2,
    matchMedia: () => ({
      matches: options.reducedMotion === true,
      addEventListener() {},
    }),
    addEventListener() {},
  };
  globals.IntersectionObserver = FakeIntersectionObserver;
  globals.ResizeObserver = FakeResizeObserver;
  globals.requestAnimationFrame = (cb: (now: number) => void) => {
    pending.push(cb);
    return nextRaf++;
  };
  globals.cancelAnimationFrame = (id: number) => {
    cancelled.push(id);
  };

  return {
    figure,
    section,
    ctx,
    observed,
    pending,
    cancelled,
    trigger: (isIntersecting: boolean) => ioCallback?.([{ isIntersecting }]),
    pump: (frames: number) => {
      let now = 0;
      for (let i = 0; i < frames; i++) {
        const cb = pending.shift();
        if (!cb) return;
        now += 40; // past the 30fps throttle, so every pump paints
        cb(now);
      }
    },
  };
}

const CALENDAR: Array<[string, number]> = Array.from({ length: 731 }, (_, i) => {
  const date = new Date(Date.parse('2024-07-25T00:00:00Z') + i * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return [date, i % 5 === 0 ? 0 : (i % 17) + 1];
});

async function mount(dataset = { calendar: CALENDAR }) {
  vi.resetModules();
  const { mountTerrain } = await import('../src/scripts/terrain');
  mountTerrain(
    harness.figure as unknown as HTMLElement,
    async () => dataset as never,
  );
  // Let the awaited dataset promise settle inside activate().
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  const globals = globalThis as unknown as Record<string, unknown>;
  for (const key of [
    'document',
    'window',
    'IntersectionObserver',
    'ResizeObserver',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ]) {
    delete globals[key];
  }
});

describe('mountTerrain', () => {
  beforeEach(() => {
    harness = install();
  });

  it('observes the section, never the hidden figure', async () => {
    await mount();
    // The regression: a display:none target never intersects, so watching the
    // figure deadlocks the whole feature.
    expect(harness.observed).toContain(harness.section);
    expect(harness.observed).not.toContain(harness.figure);
  });

  it('leaves the figure hidden until the section comes into range', async () => {
    await mount();
    expect(harness.figure.hidden).toBe(true);
    expect(harness.ctx.fills).toBe(0);
  });

  it('unhides and paints once the section is in range', async () => {
    await mount();
    harness.trigger(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.figure.hidden).toBe(false);
    harness.pump(2);
    expect(harness.ctx.fills).toBeGreaterThan(0);
  });

  it('stops the loop when the section scrolls away', async () => {
    await mount();
    harness.trigger(true);
    await Promise.resolve();
    await Promise.resolve();
    harness.pump(1);

    const before = harness.cancelled.length;
    harness.trigger(false);
    expect(harness.cancelled.length).toBeGreaterThan(before);
  });

  it('keeps the figure hidden when the dataset is unavailable', async () => {
    await mount({ calendar: [] } as never);
    harness.trigger(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.figure.hidden).toBe(true);
    expect(harness.ctx.fills).toBe(0);
  });
});

describe('mountTerrain with reduced motion', () => {
  beforeEach(() => {
    harness = install({ reducedMotion: true });
  });

  it('draws a single settled frame and never schedules a loop', async () => {
    await mount();
    harness.trigger(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.figure.hidden).toBe(false);
    expect(harness.ctx.fills).toBeGreaterThan(0);
    expect(harness.pending.length).toBe(0);
  });
});
