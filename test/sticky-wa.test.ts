/**
 * Tests for the mobile reach-me bar. The DOM is hand-rolled rather than jsdom,
 * matching terrain-mount.test.ts: the surface touched here is two querySelector
 * calls and an IntersectionObserver, so stubbing it keeps the repo
 * dependency-free while still covering the logic.
 *
 * The case that matters is the multi-target one: two inline buttons share one
 * observer, so a naive "isIntersecting -> tuck" handler un-tucks the bar as soon
 * as *either* button leaves, even while the other is still on screen.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { wireStickyWhatsApp } from '../src/scripts/sticky-wa';

interface FakeEl {
  attrs: Set<string>;
  toggleAttribute(name: string, force?: boolean): boolean;
  hasAttribute(name: string): boolean;
}

function fakeEl(): FakeEl {
  return {
    attrs: new Set<string>(),
    toggleAttribute(name, force) {
      const on = force ?? !this.attrs.has(name);
      if (on) this.attrs.add(name);
      else this.attrs.delete(name);
      return on;
    },
    hasAttribute(name) {
      return this.attrs.has(name);
    },
  };
}

let callback: IntersectionObserverCallback | null = null;
let observed: unknown[] = [];
let disconnected = false;

class FakeObserver {
  constructor(cb: IntersectionObserverCallback) {
    callback = cb;
  }
  observe(el: unknown) {
    observed.push(el);
  }
  disconnect() {
    disconnected = true;
  }
  unobserve() {}
  takeRecords() {
    return [];
  }
}

function fire(pairs: Array<[unknown, boolean]>): void {
  callback?.(
    pairs.map(([target, isIntersecting]) => ({ target, isIntersecting })) as never,
    null as never,
  );
}

/** A Document stub exposing only the two selectors the module uses. */
function fakeDoc(bar: unknown, inline: unknown[]): Document {
  return {
    querySelector: (sel: string) => (sel === '[data-sticky-wa]' ? bar : null),
    querySelectorAll: (sel: string) => (sel === '[data-wa-inline]' ? inline : []),
  } as unknown as Document;
}

beforeEach(() => {
  callback = null;
  observed = [];
  disconnected = false;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
});

afterEach(() => {
  delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
});

describe('wireStickyWhatsApp', () => {
  it('observes every inline button, never the bar itself', () => {
    const bar = fakeEl();
    const a = fakeEl();
    const b = fakeEl();
    wireStickyWhatsApp(fakeDoc(bar, [a, b]));
    expect(observed).toEqual([a, b]);
    expect(observed).not.toContain(bar);
  });

  it('ships untucked so a no-JS visitor keeps the CTA', () => {
    const bar = fakeEl();
    wireStickyWhatsApp(fakeDoc(bar, [fakeEl()]));
    expect(bar.hasAttribute('data-tucked')).toBe(false);
  });

  it('tucks while an inline button is on screen and restores after', () => {
    const bar = fakeEl();
    const hero = fakeEl();
    wireStickyWhatsApp(fakeDoc(bar, [hero]));

    fire([[hero, true]]);
    expect(bar.hasAttribute('data-tucked')).toBe(true);

    fire([[hero, false]]);
    expect(bar.hasAttribute('data-tucked')).toBe(false);
  });

  it('stays tucked while a second button is still on screen', () => {
    const bar = fakeEl();
    const hero = fakeEl();
    const cta = fakeEl();
    wireStickyWhatsApp(fakeDoc(bar, [hero, cta]));

    fire([
      [hero, true],
      [cta, true],
    ]);
    expect(bar.hasAttribute('data-tucked')).toBe(true);

    // hero scrolls away, cta is still visible -> must remain tucked
    fire([[hero, false]]);
    expect(bar.hasAttribute('data-tucked')).toBe(true);

    fire([[cta, false]]);
    expect(bar.hasAttribute('data-tucked')).toBe(false);
  });

  it('no-ops when the page has no bar or no inline buttons', () => {
    expect(() => wireStickyWhatsApp(fakeDoc(null, [fakeEl()]))).not.toThrow();
    expect(observed).toEqual([]);
    expect(() => wireStickyWhatsApp(fakeDoc(fakeEl(), []))).not.toThrow();
    expect(observed).toEqual([]);
  });

  it('returns a teardown that disconnects the observer', () => {
    wireStickyWhatsApp(fakeDoc(fakeEl(), [fakeEl()]))();
    expect(disconnected).toBe(true);
  });
});
