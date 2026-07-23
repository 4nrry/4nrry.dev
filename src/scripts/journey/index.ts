import { reducedMotion } from '../anim';
import { JourneyEngine, type Scene } from './engine';
import { emitterScene } from './scenes/emitter';
import { forkScene } from './scenes/fork';
import { pulseScene } from './scenes/pulse';
import { rideProbe, rideScene } from './scenes/ride';
import { terminusScene } from './scenes/terminus';

declare global {
  interface Window {
    __journey?: {
      state: unknown;
      segments: Array<{ id: string; startY: number; endY: number }>;
      stats: unknown;
      recompute(): void;
      packetAt(scrollY: number): number;
      ridePoint(routeId: string, t: number): { x: number; y: number } | null;
    };
  }
}

const params = new URLSearchParams(location.search);
const flag = params.get('journey');

if (flag !== 'off') {
  const debug = flag === 'debug';
  const forceFull = flag === 'on' || debug;
  const mode = flag === 'static' || (reducedMotion() && !forceFull) ? 'static' : 'full';

  const registry: Scene[] = [
    emitterScene(),
    pulseScene('jump', '#section-jump'),
    forkScene(),
    rideScene('ride-topo', 1, 'topo'),
    rideScene('ride-pipeline', 2, 'pipeline'),
    pulseScene('repos', '#section-repos'),
    pulseScene('rhythm', '#section-rhythm'),
    pulseScene('languages', '#section-languages'),
    pulseScene('oss', '#section-oss'),
    pulseScene('trajectory', '#section-trajectory'),
    terminusScene(),
  ];

  const init = () => {
    const engine = new JourneyEngine(registry, mode, debug);
    engine.recompute();

    // Geometry invalidation: everything funnels into the debounced recompute.
    new ResizeObserver(() => engine.scheduleRecompute()).observe(document.body);
    new MutationObserver(() => engine.scheduleRecompute()).observe(document.body, {
      attributes: true,
      attributeFilter: ['data-pending'],
    });
    document.fonts?.ready.then(() => engine.scheduleRecompute());
    window.addEventListener('resize', () => {
      engine.sizeCanvas();
      engine.scheduleRecompute();
    });
    // Horizontal scroll of the systems diagrams shifts SVG CTMs without any
    // window scroll; refresh geometry.
    for (const wrapper of document.querySelectorAll('#section-systems .overflow-x-auto')) {
      wrapper.addEventListener('scroll', () => engine.scheduleRecompute(), { passive: true });
    }

    window.__journey = {
      get state() {
        return engine.state;
      },
      get segments() {
        return engine.segments.map((segment) => ({
          id: segment.scene.id,
          startY: segment.startY,
          endY: segment.endY,
        }));
      },
      stats: engine.stats,
      recompute: () => engine.recompute(),
      packetAt: (scrollY: number) => engine.packetAt(scrollY),
      ridePoint(routeId: string, t: number) {
        const segment = engine.segments.find((s) => s.scene.id === routeId);
        return segment ? rideProbe.point(segment.geo, t) : null;
      },
    };
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(init, { timeout: 1500 });
  } else {
    setTimeout(init, 1);
  }
}
