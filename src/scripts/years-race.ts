import { cssWidth, easeOutCubic, formatInt, setupCanvas, themeColor, type Viz } from './anim';
import type { YearSummary } from '../../shared/schema';

const ROW_HEIGHT = 64;
const BAR_HEIGHT = 22;
const LABEL_SPACE = 20;

export function createYearsRace(canvas: HTMLCanvasElement, years: YearSummary[]): Viz {
  const height = years.length * ROW_HEIGHT + 30;
  let lastProgress = 0;
  const context = setupCanvas(canvas, height, () => render(lastProgress));
  const maxContributions = Math.max(1, ...years.map((y) => y.contributions));
  const first = years[0]?.contributions ?? 1;
  const last = years[years.length - 1]?.contributions ?? 1;
  const multiplier = first > 0 ? last / first : 0;

  function render(progress: number): void {
    lastProgress = progress;
    const width = cssWidth(canvas);
    context.clearRect(0, 0, width, canvas.height);
    const barMax = width - 130;

    years.forEach((year, i) => {
      // Stagger: earlier years finish sooner, the last year lands the punch.
      const start = i * 0.12;
      const local = easeOutCubic(Math.min(Math.max((progress - start) / (1 - start), 0), 1));
      const y = 10 + i * ROW_HEIGHT;

      context.font = '12px "JetBrains Mono", monospace';
      context.fillStyle = themeColor('--color-muted');
      context.fillText(year.label, 0, y + LABEL_SPACE - 8);

      const barWidth = Math.max(2, (year.contributions / maxContributions) * barMax * local);
      context.fillStyle = themeColor('--color-accent');
      context.beginPath();
      context.roundRect(0, y + LABEL_SPACE, barWidth, BAR_HEIGHT, 4);
      context.fill();

      context.font = '700 14px "JetBrains Mono", monospace';
      context.fillStyle = themeColor('--color-text');
      context.fillText(
        formatInt(year.contributions * local),
        barWidth + 10,
        y + LABEL_SPACE + BAR_HEIGHT - 6,
      );

      context.font = '11px "JetBrains Mono", monospace';
      context.fillStyle = themeColor('--color-faint');
      context.fillText(
        `${formatInt(year.prs * local)} PRs`,
        0,
        y + LABEL_SPACE + BAR_HEIGHT + 16,
      );
    });

    if (multiplier > 1 && progress > 0.82) {
      const pop = easeOutCubic(Math.min((progress - 0.82) / 0.18, 1));
      const stamp = `${(Math.round(multiplier * 10) / 10).toFixed(1)}x`;
      context.save();
      context.globalAlpha = pop;
      context.font = `800 ${Math.round(30 + 6 * pop)}px "JetBrains Mono", monospace`;
      context.fillStyle = themeColor('--color-accent-bright');
      const metrics = context.measureText(stamp);
      context.fillText(stamp, cssWidth(canvas) - metrics.width - 4, 10 + ROW_HEIGHT + 18);
      context.restore();
    }
  }

  return { render, durationMs: 2200 };
}
