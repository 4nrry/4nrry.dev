import type { DocRect } from '../geometry';
import type { Scene } from '../engine';
import { drawPacket, drawRectGlow } from '../sprites';

interface Branch {
  targetX: number;
  targetY: number;
  cardRect: DocRect;
  color: string;
}

interface ForkGeo {
  downgraded: boolean;
  forkY: number;
  branches: Branch[];
}

const FALLBACK_ORG_VARS = ['--color-org-smart', '--color-org-lotvs', '--color-org-ocean'];

function bezierPoint(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number): [number, number] {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

/** The gateway: the spine forks into the three org cards, the packet multicasts. */
export function forkScene(): Scene {
  return {
    id: 'fork',
    ownsPacket: true,
    resolve: () => document.querySelector('#section-orgs'),
    span: (rect, batch) => ({ startY: rect.top - batch.vpH * 0.1, endY: rect.bottom }),
    measure(element, rect, batch) {
      const cards = element.querySelectorAll('#orgs-grid > article');
      if (cards.length === 0) return null; // skeletons only, scene waits for data
      const rootStyle = getComputedStyle(document.documentElement);
      const branches: Branch[] = [...cards].map((card, i) => {
        const cardRect = batch.rect(card);
        let color = batch.cssVar(card, '--org-accent');
        if (!color || color.startsWith('var(')) {
          color = rootStyle.getPropertyValue(FALLBACK_ORG_VARS[i] ?? '--color-accent').trim();
        }
        return {
          targetX: cardRect.left - 6,
          targetY: cardRect.top + cardRect.height / 2,
          cardRect,
          color,
        };
      });
      return { downgraded: batch.vpW < 1170, forkY: rect.top + rect.height * 0.3, branches } satisfies ForkGeo;
    },
    draw(frame, local, geo) {
      const { downgraded, forkY, branches } = geo as ForkGeo;
      const { ctx, vp } = frame;

      if (downgraded) {
        // Edge mode: no room for branches; cards pulse in sequence instead.
        branches.forEach((branch, i) => {
          const window0 = 0.2 + i * 0.2;
          const t = Math.min(Math.max((local - window0) / 0.2, 0), 1);
          const alpha = t > 0 && t < 1 ? 1 - Math.abs(t * 2 - 1) : 0;
          if (alpha > 0) {
            drawRectGlow(
              ctx,
              branch.cardRect.left,
              frame.toViewportY(branch.cardRect.top),
              branch.cardRect.width,
              branch.cardRect.height,
              branch.color,
              alpha * 0.6,
            );
          }
        });
        const y = frame.toViewportY(frame.packetDocY);
        drawPacket(ctx, vp.spineX, y, frame.colors.accent, frame.colors.bright, 4);
        return;
      }

      const spineX = vp.spineX;
      const forkViewY = frame.toViewportY(forkY);

      if (local <= 0.3 || local >= 0.9) {
        const y = frame.toViewportY(frame.packetDocY);
        drawPacket(ctx, spineX, y, frame.colors.accent, frame.colors.bright, 6);
        return;
      }

      // Multicast phase: out 0.3..0.6, hold+glow 0.6..0.75, back 0.75..0.9.
      const phase = local < 0.6 ? (local - 0.3) / 0.3 : local < 0.75 ? 1 : 1 - (local - 0.75) / 0.15;
      for (const branch of branches) {
        const tx = branch.targetX;
        const ty = frame.toViewportY(branch.targetY);
        const cx = spineX + (tx - spineX) * 0.25;
        const cy = forkViewY + (ty - forkViewY) * 0.1;

        // Partial branch stroke up to the sub-packet.
        ctx.save();
        ctx.strokeStyle = branch.color;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(spineX, forkViewY);
        const steps = 20;
        for (let i = 1; i <= steps * phase; i++) {
          const [bx, by] = bezierPoint(spineX, forkViewY, cx, cy, tx, ty, i / steps);
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
        ctx.restore();

        const [px, py] = bezierPoint(spineX, forkViewY, cx, cy, tx, ty, phase);
        drawPacket(ctx, px, py, branch.color, frame.colors.bright, 4.5);

        const glowAlpha = local >= 0.55 && local <= 0.85 ? 1 - Math.abs(((local - 0.55) / 0.3) * 2 - 1) : 0;
        drawRectGlow(
          ctx,
          branch.cardRect.left,
          frame.toViewportY(branch.cardRect.top),
          branch.cardRect.width,
          branch.cardRect.height,
          branch.color,
          glowAlpha * 0.7,
        );
      }
    },
  };
}
