import { docMatrix, pointOnPath, samplePath, type DocPoint, type DocRect, type SampledPath } from '../geometry';
import type { Scene } from '../engine';
import { drawPacket, drawPulseRing, drawRectGlow } from '../sprites';

interface Leg {
  sampled: SampledPath;
  start: DocPoint;
  end: DocPoint;
}

interface RideGeo {
  fallback: boolean;
  anchorY: number;
  matrix: DOMMatrix | null;
  legs: Leg[];
  clipRect: DocRect | null;
  gateRect: DocRect | null;
  entry: DocPoint | null;
}

/** Share of route time per element: legs weigh 1, bridges between legs 0.45. */
const BRIDGE_WEIGHT = 0.45;

export interface RideProbe {
  point(geo: unknown, t: number): DocPoint | null;
}

function routePosition(geo: RideGeo, t: number): DocPoint | null {
  if (!geo.matrix || geo.legs.length === 0) return null;
  const parts: Array<{ kind: 'leg' | 'bridge'; index: number; weight: number }> = [];
  geo.legs.forEach((_leg, i) => {
    if (i > 0) parts.push({ kind: 'bridge', index: i, weight: BRIDGE_WEIGHT });
    parts.push({ kind: 'leg', index: i, weight: 1 });
  });
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  let remaining = Math.min(Math.max(t, 0), 1) * totalWeight;
  for (const part of parts) {
    if (remaining > part.weight) {
      remaining -= part.weight;
      continue;
    }
    const local = part.weight === 0 ? 0 : remaining / part.weight;
    if (part.kind === 'leg') {
      return pointOnPath(geo.legs[part.index]!.sampled, geo.matrix, local);
    }
    const from = geo.legs[part.index - 1]!.end;
    const to = geo.legs[part.index]!.start;
    return { x: from.x + (to.x - from.x) * local, y: from.y + (to.y - from.y) * local };
  }
  return geo.legs[geo.legs.length - 1]!.end;
}

export const rideProbe: RideProbe = { point: (geo, t) => routePosition(geo as RideGeo, t) };

/**
 * The heart: the packet leaves the spine and rides the actual SVG diagram
 * paths of the systems section, clipped to the diagram's scroll container.
 */
export function rideScene(id: string, articleIndex: number, route: string): Scene {
  return {
    id,
    ownsPacketAt: (local, geo) => !(geo as RideGeo).fallback && local > 0.08 && local < 0.92,
    resolve: () =>
      document.querySelector(`#section-systems article:nth-of-type(${articleIndex})`),
    span: (rect) => ({ startY: rect.top, endY: rect.bottom }),
    measure(element, rect, batch) {
      const paths = [...element.querySelectorAll<SVGPathElement>(`path[data-journey-ride="${route}"]`)].sort(
        (a, b) => Number(a.dataset.leg ?? 0) - Number(b.dataset.leg ?? 0),
      );
      const svg = paths[0]?.ownerSVGElement ?? null;
      const matrix = svg ? docMatrix(svg, batch) : null;
      const anchorY = rect.top + 28;
      if (!svg || !matrix || paths.length === 0) {
        return { fallback: true, anchorY, matrix: null, legs: [], clipRect: null, gateRect: null, entry: null } satisfies RideGeo;
      }
      const legs: Leg[] = paths.map((path) => {
        const sampled = samplePath(path);
        return {
          sampled,
          start: pointOnPath(sampled, matrix, 0),
          end: pointOnPath(sampled, matrix, 1),
        };
      });
      const wrapper = svg.closest('.overflow-x-auto');
      const gate = element.querySelector<SVGGraphicsElement>('[data-journey-node="gate"]');
      return {
        fallback: false,
        anchorY,
        matrix,
        legs,
        clipRect: wrapper ? batch.rect(wrapper) : null,
        gateRect: gate ? batch.rect(gate) : null,
        entry: legs[0]!.start,
      } satisfies RideGeo;
    },
    draw(frame, local, geo) {
      const rideGeo = geo as RideGeo;
      const { ctx, vp } = frame;

      if (rideGeo.fallback) {
        const y = frame.toViewportY(rideGeo.anchorY);
        drawPulseRing(ctx, vp.spineX, y, local, frame.colors.accent);
        return;
      }

      const entry = rideGeo.entry!;
      const entryView = { x: entry.x, y: frame.toViewportY(entry.y) };

      // Outside the ride window the engine's default spine packet rules.
      if (local <= 0.08 || local >= 0.92) return;

      ctx.save();
      if (rideGeo.clipRect) {
        const clip = rideGeo.clipRect;
        ctx.beginPath();
        ctx.rect(clip.left, frame.toViewportY(clip.top), clip.width, clip.height);
        ctx.clip();
      }

      const t = (local - 0.08) / 0.84;

      // The packet hops from the spine into the diagram: a brief flash at the
      // entry instead of a connector line crossing the text column.
      if (t < 0.1) {
        drawPulseRing(ctx, entryView.x, entryView.y, t / 0.1, frame.colors.accent);
      }

      const TRAIL_STEPS = 36;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= TRAIL_STEPS * t; i++) {
        const point = routePosition(rideGeo, i / TRAIL_STEPS);
        if (!point) continue;
        const viewY = frame.toViewportY(point.y);
        if (started) ctx.lineTo(point.x, viewY);
        else {
          ctx.moveTo(point.x, viewY);
          started = true;
        }
      }
      ctx.globalAlpha = 0.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      const position = routePosition(rideGeo, t);
      if (position) {
        drawPacket(ctx, position.x, frame.toViewportY(position.y), frame.colors.accent, frame.colors.bright, 5);
      }

      // The sanitize gate flashes "pass" as the packet crosses it.
      if (rideGeo.gateRect) {
        const gateMidT = 0.62;
        const proximity = 1 - Math.min(Math.abs(t - gateMidT) / 0.12, 1);
        if (proximity > 0) {
          const passColor = getComputedStyle(document.documentElement)
            .getPropertyValue('--color-org-smart')
            .trim();
          drawRectGlow(
            ctx,
            rideGeo.gateRect.left - 3,
            frame.toViewportY(rideGeo.gateRect.top) - 3,
            rideGeo.gateRect.width + 6,
            rideGeo.gateRect.height + 6,
            passColor || '#16a34a',
            proximity,
          );
        }
      }

      ctx.restore();
    },
  };
}
