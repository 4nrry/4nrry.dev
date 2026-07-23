import { heatColor } from '../../anim';
import type { Scene } from '../engine';
import { drawPacket } from '../sprites';

interface EmitterGeo {
  emitY: number;
  pileY: number;
}

/**
 * The origin: a stylized compost pile with a sensor probe in the hero gutter.
 * The probe LED brightens as the reader approaches the emission point; the
 * packet is born sliding from the probe onto the spine.
 */
export function emitterScene(): Scene {
  return {
    id: 'emitter',
    ownsPacketAt: (local) => local > 0.75 && local < 1,
    resolve: () => document.querySelector('[data-journey="hero"]'),
    span: (rect) => ({ startY: rect.top, endY: rect.bottom - 24 }),
    measure: (_element, rect) =>
      ({ emitY: rect.bottom - 24, pileY: rect.bottom - 60 }) satisfies EmitterGeo,
    draw(frame, local, geo) {
      const { emitY, pileY } = geo as EmitterGeo;
      const { ctx, vp } = frame;
      const x = vp.spineX;
      const y = frame.toViewportY(pileY);
      if (y > -80 && y < vp.h + 80) {
        const scale = vp.mode === 'gutter' ? 1 : 0.6;
        // Mound: three stacked heat layers.
        const layers: Array<[number, number, number]> = [
          [22, 10, 0.25],
          [15, 8, 0.5],
          [8, 6, 0.8],
        ];
        for (const [radiusX, radiusY, heat] of layers) {
          ctx.fillStyle = heatColor(heat);
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.ellipse(x, y - (10 - radiusY) * scale, radiusX * scale, radiusY * scale, 0, Math.PI, 0);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Probe rod + LED.
        ctx.strokeStyle = frame.colors.muted;
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        ctx.moveTo(x, y - 6 * scale);
        ctx.lineTo(x, y - 26 * scale);
        ctx.stroke();
        const led = Math.min(local / 0.75, 1);
        ctx.fillStyle = frame.colors.bright;
        ctx.globalAlpha = 0.25 + led * 0.75;
        ctx.beginPath();
        ctx.arc(x, y - 28 * scale, 2.5 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Birth: the packet slides from the probe down to the emission point.
      if (local > 0.75 && local < 1) {
        const t = (local - 0.75) / 0.25;
        const fromY = pileY - 28;
        const packetY = frame.toViewportY(fromY + (emitY - fromY) * t);
        drawPacket(ctx, x, packetY, frame.colors.accent, frame.colors.bright, 4 + 2 * t);
      }
    },
  };
}
