import type { DocRect } from '../geometry';
import type { Scene } from '../engine';
import { drawRectGlow } from '../sprites';

interface TerminusGeo {
  dockY: number;
  glowRect: DocRect | null;
}

/** Journey's end: the packet docks and the contact links warm up. */
export function terminusScene(): Scene {
  return {
    id: 'terminus',
    resolve: () => document.querySelector('#contact'),
    span: (rect, batch) => ({ startY: rect.top - batch.vpH * 0.2, endY: rect.bottom - 40 }),
    measure(element, rect, batch) {
      const linksRow = element.querySelector('.flex.flex-wrap');
      const glowRect = linksRow ? batch.rect(linksRow) : null;
      return { dockY: (glowRect?.top ?? rect.bottom) - 16, glowRect } satisfies TerminusGeo;
    },
    draw(frame, local, geo) {
      const { glowRect } = geo as TerminusGeo;
      if (!glowRect || local <= 0) return;
      drawRectGlow(
        frame.ctx,
        glowRect.left - 8,
        frame.toViewportY(glowRect.top) - 8,
        glowRect.width + 16,
        glowRect.height + 16,
        frame.colors.accent,
        local * 0.55,
      );
    },
  };
}
