import { attachTooltip, cssWidth, easeOutCubic, setupCanvas, type Viz } from './anim';
import type { LanguageStat } from '../../shared/schema';

const BAR_HEIGHT = 40;
const GAP = 2;
const FALLBACK_COLOR = '#52525b';

export function createLanguagesViz(canvas: HTMLCanvasElement, languages: LanguageStat[]): Viz {
  let lastProgress = 0;
  const context = setupCanvas(canvas, BAR_HEIGHT + 8, () => render(lastProgress));
  const total = languages.reduce((sum, lang) => sum + lang.bytes, 0) || 1;

  interface Segment {
    language: LanguageStat;
    from: number;
    to: number;
  }
  let cursor = 0;
  const segments: Segment[] = languages.map((language) => {
    const from = cursor;
    cursor += language.bytes / total;
    return { language, from, to: cursor };
  });

  function render(progress: number): void {
    lastProgress = progress;
    const width = cssWidth(canvas);
    context.clearRect(0, 0, width, canvas.height);
    const eased = easeOutCubic(progress);
    const usable = width - (segments.length - 1) * GAP;

    segments.forEach((segment, i) => {
      const x = segment.from * usable * eased + i * GAP;
      const segmentWidth = Math.max(1, (segment.to - segment.from) * usable * eased);
      context.fillStyle = segment.language.color ?? FALLBACK_COLOR;
      context.beginPath();
      context.roundRect(x, 4, segmentWidth, BAR_HEIGHT, 3);
      context.fill();
    });
  }

  attachTooltip(canvas, (x) => {
    const width = cssWidth(canvas);
    const usable = width - (segments.length - 1) * GAP;
    const hit = segments.find((segment, i) => {
      const start = segment.from * usable + i * GAP;
      return x >= start && x <= start + (segment.to - segment.from) * usable;
    });
    if (!hit) return null;
    return `${hit.language.name} · ${hit.language.pct}%`;
  });

  return { render, durationMs: 1400 };
}
