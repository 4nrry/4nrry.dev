import { attachTooltip, cssWidth, easeOutCubic, formatInt, setupCanvas, themeColor, type Viz } from './anim';

export interface RepoBarRow {
  name: string;
  prs: number;
  orgName: string;
  accent: string;
}

const ROW_HEIGHT = 34;
const BAR_HEIGHT = 14;
const NAME_SPACE = 15;

export function createRepoBars(canvas: HTMLCanvasElement, rows: RepoBarRow[]): Viz {
  const height = rows.length * ROW_HEIGHT + 8;
  let lastProgress = 0;
  const context = setupCanvas(canvas, height, () => render(lastProgress));
  const max = Math.max(1, ...rows.map((r) => r.prs));

  function render(progress: number): void {
    lastProgress = progress;
    const width = cssWidth(canvas);
    context.clearRect(0, 0, width, canvas.height);
    const barMax = width - 70;

    rows.forEach((row, i) => {
      const start = Math.min(i * 0.055, 0.5);
      const local = easeOutCubic(Math.min(Math.max((progress - start) / (1 - start), 0), 1));
      const y = 4 + i * ROW_HEIGHT;

      context.font = '11px "JetBrains Mono", monospace';
      context.fillStyle = themeColor('--color-muted');
      context.fillText(row.name, 0, y + NAME_SPACE - 4);

      const barWidth = Math.max(2, (row.prs / max) * barMax * local);
      context.fillStyle = row.accent;
      context.beginPath();
      context.roundRect(0, y + NAME_SPACE, barWidth, BAR_HEIGHT, 3);
      context.fill();

      context.font = '700 11px "JetBrains Mono", monospace';
      context.fillStyle = themeColor('--color-text');
      context.fillText(formatInt(row.prs * local), barWidth + 8, y + NAME_SPACE + BAR_HEIGHT - 3);
    });
  }

  attachTooltip(canvas, (_x, y) => {
    const index = Math.floor((y - 4) / ROW_HEIGHT);
    const row = rows[index];
    if (!row) return null;
    return `${row.name} · ${formatInt(row.prs)} PRs · ${row.orgName}`;
  });

  return { render, durationMs: 1600 };
}
