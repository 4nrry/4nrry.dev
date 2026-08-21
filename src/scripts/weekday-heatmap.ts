import { attachTooltip, cssWidth, formatInt, heatColor, HEAT_ZERO, setupCanvas, themeColor, type Viz } from './anim';

const GUTTER_LEFT = 34;
const GUTTER_TOP = 4;
const GAP = 2;
const ROW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/**
 * Cells follow the column width instead of a fixed 16px, so the grid stays
 * roughly square from a phone to a desktop. This is what let the canvas drop
 * `min-w-[640px]`: it used to force a 640px chart into a 277px box and hide
 * more than half of it behind a scroll with no affordance.
 */
const MIN_CELL_HEIGHT = 10;
const MAX_CELL_HEIGHT = 16;
/** Roughly the width of a month label plus breathing room, in CSS px. */
const LABEL_PITCH = 90;

export function createWeekdayHeatmap(
  canvas: HTMLCanvasElement,
  matrix: number[][],
  monthLabels: string[],
  rowLabels: string[] = ROW_LABELS,
  cellWord = 'contributions',
): Viz {
  const columns = Math.max(1, monthLabels.length);

  const columnWidth = (width: number) => Math.max(1, (width - GUTTER_LEFT - columns * GAP) / columns);
  const cellHeightFor = (width: number) =>
    Math.max(MIN_CELL_HEIGHT, Math.min(MAX_CELL_HEIGHT, Math.round(columnWidth(width))));
  const heightFor = (width: number) => GUTTER_TOP + 7 * (cellHeightFor(width) + GAP) + 20;

  let lastProgress = 0;
  const context = setupCanvas(canvas, heightFor, () => render(lastProgress));
  const max = Math.max(1, ...matrix.flat());
  const logMax = Math.log1p(max);

  function geometry() {
    const width = cssWidth(canvas);
    const cellWidth = columnWidth(width);
    const cellHeight = cellHeightFor(width);
    return {
      width,
      cellWidth,
      cellHeight,
      step: cellWidth + GAP,
      rowStep: cellHeight + GAP,
      height: heightFor(width),
    };
  }

  function render(progress: number): void {
    lastProgress = progress;
    const { width, cellWidth, cellHeight, step, rowStep, height } = geometry();
    context.clearRect(0, 0, width, canvas.height);

    context.font = '9px "JetBrains Mono", monospace';
    context.fillStyle = themeColor('--color-faint');
    rowLabels.forEach((label, row) => {
      if (row % 2 === 0) {
        context.fillText(label, 0, GUTTER_TOP + row * rowStep + cellHeight - 2);
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
          GUTTER_TOP + row * rowStep,
          cellWidth,
          cellHeight,
          2,
        );
        context.fill();
      }
    }
    context.globalAlpha = 1;

    // Label stride follows the column pitch, so the axis thins out instead of
    // overprinting itself when the chart is narrow.
    const stride = Math.max(1, Math.ceil(LABEL_PITCH / step));
    context.font = '9px "JetBrains Mono", monospace';
    context.fillStyle = themeColor('--color-faint');
    for (let col = 0; col < columns; col += stride) {
      const label = monthLabels[col] ?? '';
      const x = GUTTER_LEFT + col * step;
      // The last stride can land close enough to the edge to be cut in half.
      if (x + context.measureText(label).width > width) break;
      context.fillText(label, x, height - 6);
    }
  }

  attachTooltip(canvas, (x, y) => {
    const { step, rowStep } = geometry();
    const col = Math.floor((x - GUTTER_LEFT) / step);
    const row = Math.floor((y - GUTTER_TOP) / rowStep);
    if (col < 0 || col >= columns || row < 0 || row > 6) return null;
    const value = matrix[row]?.[col] ?? 0;
    return `${rowLabels[row]} · ${monthLabels[col]} · ${formatInt(value)} ${cellWord}`;
  });

  return { render, durationMs: 1800 };
}
