import {
  attachTooltip,
  cssWidth,
  easeOutCubic,
  formatInt,
  heatColor,
  HEAT_ZERO,
  setupCanvas,
  themeColor,
  type Viz,
} from './anim';

export interface CalendarReplayOptions {
  calendar: Array<[string, number]>;
  monthLabels: string[];
  monthlyTotals: number[];
  counters: {
    contributions: { element: HTMLElement; target: number };
    prsMerged: { element: HTMLElement; target: number };
    streak: { element: HTMLElement; target: number };
  };
  ticker: HTMLElement | null;
}

const GUTTER_LEFT = 30;
const GUTTER_TOP = 8;
const GAP = 2;
const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

interface Cell {
  week: number;
  weekday: number;
  date: string;
  count: number;
  monthIndex: number;
}

export function createCalendarReplay(canvas: HTMLCanvasElement, options: CalendarReplayOptions): Viz {
  const { calendar, monthLabels, monthlyTotals, counters, ticker } = options;

  const firstDate = calendar[0]?.[0] ?? '2024-01-01';
  const firstWeekday = (new Date(`${firstDate}T00:00:00Z`).getUTCDay() + 6) % 7;
  const monthIndexByKey = new Map<string, number>();
  const cells: Cell[] = calendar.map(([date, count], i) => {
    const key = date.slice(0, 7);
    if (!monthIndexByKey.has(key)) monthIndexByKey.set(key, monthIndexByKey.size);
    return {
      week: Math.floor((i + firstWeekday) / 7),
      weekday: (i + firstWeekday) % 7,
      date,
      count,
      monthIndex: monthIndexByKey.get(key)!,
    };
  });
  const weeks = (cells[cells.length - 1]?.week ?? 0) + 1;
  const maxCount = Math.max(1, ...cells.map((c) => c.count));
  const logMax = Math.log1p(maxCount);

  // Contributions revealed once the scan passes each week column.
  const weekPrefix: number[] = new Array(weeks + 1).fill(0);
  for (const cell of cells) weekPrefix[cell.week + 1]! += cell.count;
  for (let i = 1; i <= weeks; i++) weekPrefix[i]! += weekPrefix[i - 1]!;
  const totalInCalendar = weekPrefix[weeks]! || 1;

  const cellSizeFor = (width: number) =>
    Math.max(3, Math.floor((width - GUTTER_LEFT - weeks * GAP) / weeks));

  const initialCell = cellSizeFor(canvas.clientWidth || 900);
  const height = GUTTER_TOP + 7 * (initialCell + GAP) + 18;

  let lastProgress = 0;
  const context = setupCanvas(canvas, height, () => render(lastProgress));

  function geometry() {
    const width = cssWidth(canvas);
    const cell = cellSizeFor(width);
    return { cell, step: cell + GAP };
  }

  function render(progress: number): void {
    lastProgress = progress;
    const { cell, step } = geometry();
    const width = cssWidth(canvas);
    context.clearRect(0, 0, width, canvas.height);

    const scanWeek = progress * weeks;
    const scanX = GUTTER_LEFT + scanWeek * step;

    context.font = '9px "JetBrains Mono", monospace';
    context.fillStyle = themeColor('--color-faint');
    WEEKDAY_LABELS.forEach((label, row) => {
      if (label) context.fillText(label, 0, GUTTER_TOP + row * step + cell - 1);
    });

    for (const c of cells) {
      const x = GUTTER_LEFT + c.week * step;
      const y = GUTTER_TOP + c.weekday * step;
      const revealed = c.week < scanWeek;
      if (revealed) {
        const t = c.count === 0 ? 0 : Math.log1p(c.count) / logMax;
        context.fillStyle = c.count === 0 ? HEAT_ZERO : heatColor(t);
        context.globalAlpha = 1;
      } else {
        context.fillStyle = HEAT_ZERO;
        context.globalAlpha = 0.45;
      }
      context.beginPath();
      context.roundRect(x, y, cell, cell, Math.min(2, cell / 3));
      context.fill();
    }
    context.globalAlpha = 1;

    if (progress > 0 && progress < 1) {
      context.save();
      context.strokeStyle = themeColor('--color-accent-bright');
      context.shadowColor = themeColor('--color-accent');
      context.shadowBlur = 12;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(scanX, GUTTER_TOP - 4);
      context.lineTo(scanX, GUTTER_TOP + 7 * step);
      context.stroke();
      context.restore();
    }

    // Counters track what the scan has actually revealed.
    const eased = easeOutCubic(progress);
    const revealedShare =
      progress >= 1
        ? 1
        : (weekPrefix[Math.floor(scanWeek)]! +
            (scanWeek - Math.floor(scanWeek)) *
              ((weekPrefix[Math.min(Math.floor(scanWeek) + 1, weeks)] ?? totalInCalendar) -
                weekPrefix[Math.floor(scanWeek)]!)) /
          totalInCalendar;
    counters.contributions.element.textContent = formatInt(counters.contributions.target * revealedShare);
    counters.prsMerged.element.textContent = formatInt(counters.prsMerged.target * revealedShare);
    counters.streak.element.textContent = formatInt(counters.streak.target * eased);

    if (ticker) {
      const monthIndex = Math.min(
        monthLabels.length - 1,
        Math.floor((progress >= 1 ? 0.9999 : progress) * monthLabels.length),
      );
      const label = monthLabels[monthIndex] ?? '';
      const total = monthlyTotals[monthIndex] ?? 0;
      ticker.textContent = `${label} · ${formatInt(total)} contributions`;
    }
  }

  attachTooltip(canvas, (x, y) => {
    const { cell, step } = geometry();
    const week = Math.floor((x - GUTTER_LEFT) / step);
    const weekday = Math.floor((y - GUTTER_TOP) / step);
    if (week < 0 || weekday < 0 || weekday > 6) return null;
    const inCell = (x - GUTTER_LEFT) % step <= cell && (y - GUTTER_TOP) % step <= cell;
    if (!inCell) return null;
    const hit = cells.find((c) => c.week === week && c.weekday === weekday);
    if (!hit) return null;
    return `${hit.date} · ${formatInt(hit.count)} contribution${hit.count === 1 ? '' : 's'}`;
  });

  return { render, durationMs: 9000 };
}
