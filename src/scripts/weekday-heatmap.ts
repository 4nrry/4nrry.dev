import { attachTooltip, cssWidth, formatInt, heatColor, HEAT_ZERO, setupCanvas, themeColor, type Viz } from './anim';

const GUTTER_LEFT = 34;
const GUTTER_TOP = 4;
const GAP = 2;
const ROW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CELL_HEIGHT = 16;

export function createWeekdayHeatmap(
  canvas: HTMLCanvasElement,
  matrix: number[][],
  monthLabels: string[],
): Viz {
  const columns = monthLabels.length;
  const height = GUTTER_TOP + 7 * (CELL_HEIGHT + GAP) + 20;
  let lastProgress = 0;
  const context = setupCanvas(canvas, height, () => render(lastProgress));
  const max = Math.max(1, ...matrix.flat());
  const logMax = Math.log1p(max);

  const columnWidth = () => (cssWidth(canvas) - GUTTER_LEFT - columns * GAP) / columns;

  function render(progress: number): void {
    lastProgress = progress;
    const width = cssWidth(canvas);
    context.clearRect(0, 0, width, canvas.height);
    const cellWidth = columnWidth();
    const step = cellWidth + GAP;

    context.font = '9px "JetBrains Mono", monospace';
    context.fillStyle = themeColor('--color-faint');
    ROW_LABELS.forEach((label, row) => {
      if (row % 2 === 0) {
        context.fillText(label, 0, GUTTER_TOP + row * (CELL_HEIGHT + GAP) + CELL_HEIGHT - 4);
      }
    });

    const revealedColumns = progress * columns;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < columns; col++) {
        const value = matrix[row]?.[col] ?? 0;
        const revealed = col < revealedColumns;
        const t = value === 0 ? 0 : Math.log1p(value) / logMax;
        context.fillStyle = value === 0 ? HEAT_ZERO : heatColor(t);
        context.globalAlpha = revealed ? 1 : 0.25;
        context.beginPath();
        context.roundRect(
          GUTTER_LEFT + col * step,
          GUTTER_TOP + row * (CELL_HEIGHT + GAP),
          cellWidth,
          CELL_HEIGHT,
          2,
        );
        context.fill();
      }
    }
    context.globalAlpha = 1;

    context.font = '9px "JetBrains Mono", monospace';
    context.fillStyle = themeColor('--color-faint');
    for (let col = 0; col < columns; col += 3) {
      context.fillText(monthLabels[col] ?? '', GUTTER_LEFT + col * step, height - 6);
    }
  }

  attachTooltip(canvas, (x, y) => {
    const step = columnWidth() + GAP;
    const col = Math.floor((x - GUTTER_LEFT) / step);
    const row = Math.floor((y - GUTTER_TOP) / (CELL_HEIGHT + GAP));
    if (col < 0 || col >= columns || row < 0 || row > 6) return null;
    const value = matrix[row]?.[col] ?? 0;
    return `${ROW_LABELS[row]} · ${monthLabels[col]} · ${formatInt(value)} contributions`;
  });

  return { render, durationMs: 1800 };
}
