import type { DocRect } from '../geometry';
import type { Scene } from '../engine';
import { drawPacket, drawRectGlow } from '../sprites';

interface Branch {
  centerX: number;
  cardTop: number;
  cardRect: DocRect;
  color: string;
}

interface ForkGeo {
  downgraded: boolean;
  railY: number;
  branches: Branch[];
}

const FALLBACK_ORG_VARS = ['--color-org-smart', '--color-org-lotvs', '--color-org-ocean'];

/**
 * The gateway, routed like a metro map: the packet rises to a horizontal
 * distribution rail that runs through the whitespace gap ABOVE the org
 * cards, splits into three, and each branch drops vertically onto its
 * card's top edge. Orthogonal segments only, so nothing ever crosses text.
 */
export function forkScene(): Scene {
  return {
    id: 'fork',
    ownsPacketAt: (local, geo) => !(geo as ForkGeo).downgraded && local > 0.2 && local < 0.9,
    resolve: () => document.querySelector('#section-orgs'),
    span: (rect, batch) => ({ startY: rect.top - batch.vpH * 0.1, endY: rect.bottom }),
    measure(element, _rect, batch) {
      const grid = element.querySelector('#orgs-grid');
      const cards = element.querySelectorAll('#orgs-grid > article');
      if (!grid || cards.length === 0) return null;
      const gridRect = batch.rect(grid);
      const rootStyle = getComputedStyle(document.documentElement);
      const branches: Branch[] = [...cards].map((card, i) => {
        const cardRect = batch.rect(card);
        let color = batch.cssVar(card, '--org-accent');
        if (!color || color.startsWith('var(')) {
          color = rootStyle.getPropertyValue(FALLBACK_ORG_VARS[i] ?? '--color-accent').trim();
        }
        return {
          centerX: cardRect.left + cardRect.width / 2,
          cardTop: cardRect.top,
          cardRect,
          color,
        };
      });
      // The rail lives in the gap between the section intro and the cards.
      const railY = gridRect.top - 18;
      return { downgraded: batch.vpW < 1170, railY, branches } satisfies ForkGeo;
    },
    draw(frame, local, geo) {
      const { downgraded, railY, branches } = geo as ForkGeo;
      const { ctx, vp } = frame;

      if (downgraded) {
        // Edge mode: sequential card-border pulses, packet stays on the spine.
        branches.forEach((branch, i) => {
          const start = 0.2 + i * 0.2;
          const t = Math.min(Math.max((local - start) / 0.2, 0), 1);
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
        return;
      }

      const spineX = vp.spineX;
      const railViewY = frame.toViewportY(railY);

      // Outside the multicast window the engine's default spine packet rules.
      if (local <= 0.2 || local >= 0.9) return;

      // 0.2..0.75 the multicast plays; 0.75..0.9 it fades while the packet
      // re-forms on the spine.
      const fade = local < 0.75 ? 1 : 1 - (local - 0.75) / 0.15;
      const play = Math.min((local - 0.2) / 0.55, 1);

      // Amber bus rail growing from the spine toward the farthest card.
      const farthestX = Math.max(...branches.map((b) => b.centerX));
      const railProgress = Math.min(play / 0.5, 1);
      ctx.save();
      ctx.globalAlpha = 0.5 * fade;
      ctx.strokeStyle = frame.colors.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(spineX, railViewY);
      ctx.lineTo(spineX + (farthestX - spineX) * railProgress, railViewY);
      ctx.stroke();
      ctx.restore();

      branches.forEach((branch, i) => {
        const railLength = branch.centerX - spineX;
        // The drop dips just past the card border into its top padding, so
        // the arrival reads without touching any text.
        const dropLength = branch.cardTop + 14 - railY;
        const total = railLength + dropLength;
        // Slight stagger, all deliveries done by play 0.8 so the glow has
        // room to settle before the fade.
        const start = i * 0.08;
        const t = Math.min(Math.max((play - start) / (0.8 - start), 0), 1);
        const traveled = total * t;

        const onRail = traveled <= railLength;
        const packetX = onRail ? spineX + traveled : branch.centerX;
        const packetDocYBranch = onRail ? railY : railY + (traveled - railLength);

        // Colored drop segment appears once the branch point is passed.
        if (!onRail) {
          ctx.save();
          ctx.globalAlpha = 0.55 * fade;
          ctx.strokeStyle = branch.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(branch.centerX, railViewY);
          ctx.lineTo(branch.centerX, frame.toViewportY(packetDocYBranch));
          ctx.stroke();
          ctx.restore();
        }

        if (t > 0 && t < 1 && fade > 0.05) {
          ctx.save();
          ctx.globalAlpha = fade;
          drawPacket(ctx, packetX, frame.toViewportY(packetDocYBranch), branch.color, frame.colors.bright, 4.5);
          ctx.restore();
        }

        // Arrival: the card lights up in its org color and settles.
        if (t >= 1) {
          const settle = Math.min(Math.max((play - 0.8) / 0.2, 0), 1);
          drawRectGlow(
            ctx,
            branch.cardRect.left,
            frame.toViewportY(branch.cardRect.top),
            branch.cardRect.width,
            branch.cardRect.height,
            branch.color,
            (0.4 + 0.3 * settle) * fade,
          );
        }
      });
    },
  };
}
