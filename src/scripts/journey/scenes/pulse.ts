import type { Scene } from '../engine';
import { drawPulseRing } from '../sprites';

interface PulseGeo {
  anchorY: number;
}

/** Generic station: a ring pulse on the spine as the packet passes. */
export function pulseScene(id: string, selector: string): Scene {
  return {
    id,
    resolve: () => document.querySelector(selector),
    span: (rect) => ({ startY: rect.top, endY: rect.bottom }),
    measure: (_element, rect) => ({ anchorY: rect.top + 28 }) satisfies PulseGeo,
    draw(frame, local, geo) {
      const { anchorY } = geo as PulseGeo;
      const y = frame.toViewportY(anchorY);
      if (y < -30 || y > frame.vp.h + 30) return;
      drawPulseRing(frame.ctx, frame.vp.spineX, y, local, frame.colors.accent);
    },
  };
}
