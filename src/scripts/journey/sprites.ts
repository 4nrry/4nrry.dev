/**
 * Pre-rendered offscreen sprites. shadowBlur is the one genuinely expensive
 * canvas op, so glows are rendered once into small offscreen canvases and
 * stamped with drawImage on the hot path.
 */

const spriteCache = new Map<string, HTMLCanvasElement>();

function makeSprite(key: string, size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void): HTMLCanvasElement {
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  paint(ctx, size);
  spriteCache.set(key, canvas);
  return canvas;
}

/** Soft radial glow disc in the given color. */
export function glowSprite(color: string, size = 48): HTMLCanvasElement {
  return makeSprite(`glow:${color}:${size}`, size, (ctx, s) => {
    const gradient = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.35, color);
    gradient.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Solid packet core with a bright rim. */
export function packetSprite(color: string, rim: string, size = 16): HTMLCanvasElement {
  return makeSprite(`packet:${color}:${rim}:${size}`, size, (ctx, s) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

export function drawPacket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  rim: string,
  radius: number,
  glowScale = 3,
): void {
  const glow = glowSprite(color);
  const glowSize = radius * 2 * glowScale;
  ctx.drawImage(glow, x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);
  const core = packetSprite(color, rim);
  ctx.drawImage(core, x - radius, y - radius, radius * 2, radius * 2);
}

/** Expanding ring pulse, cheap enough to stroke directly. */
export function drawPulseRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  local: number,
  color: string,
): void {
  const intensity = 1 - Math.abs(local * 2 - 1);
  if (intensity <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = intensity * 0.7;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 6 + local * 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Rounded-rect outline glow used for card/box arrivals. Zero DOM writes. */
export function drawRectGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  alpha: number,
): void {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = Math.min(alpha, 0.85);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.stroke();
  ctx.restore();
}
