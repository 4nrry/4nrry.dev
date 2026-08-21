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
  counters: {
    contributions: { element: HTMLElement; target: number };
    prsMerged: { element: HTMLElement; target: number };
    streak: { element: HTMLElement; target: number };
  };
  ticker: HTMLElement | null;
  words?: { ticker: string; one: string; many: string };
  weekdayGutter?: string[];
  /**
   * Accessible name for the canvas. Called again whenever the drawn window
   * changes, because on a phone it is a slice rather than the whole two years.
   */
  describeWindow?: (weeksShown: number, weeksTotal: number) => string;
}

const GUTTER_LEFT = 30;
const GUTTER_TOP = 8;
const GAP = 2;
/**
 * Smallest cell that still reads as a day rather than dust. The canvas used to
 * carry `min-w-[640px]`, which pinned all 105 weeks into 640px and drew 3px
 * cells on a phone — half of them behind a horizontal scroll nothing hinted at.
 * The window narrows to protect the cell instead: the chart always fills the
 * width it is given, and shows as much history as fits at a legible size. On a
 * desktop that is still the whole window at the same 7px it always drew.
 */
const MIN_CELL = 7;
const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/** How many trailing weeks fit at MIN_CELL, capped at what the dataset holds. */
const weeksFor = (width: number, total: number) =>
  Math.max(8, Math.min(total, Math.floor((width - GUTTER_LEFT) / (MIN_CELL + GAP))));

const cellFor = (width: number, weeks: number) =>
  Math.max(MIN_CELL, Math.floor((width - GUTTER_LEFT - weeks * GAP) / weeks));

const weekdayOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

interface Cell {
  week: number;
  weekday: number;
  date: string;
  count: number;
  monthIndex: number;
}

/** Everything derived from one choice of window width. Rebuilt on resize. */
interface Window {
  requested: number;
  weeks: number;
  cells: Cell[];
  logMax: number;
  /** Contributions revealed once the scan has passed each week column. */
  weekPrefix: number[];
  total: number;
  /** Index of the window's first month inside the full monthLabels list. */
  monthOffset: number;
  monthTotals: number[];
}

export function createCalendarReplay(canvas: HTMLCanvasElement, options: CalendarReplayOptions): Viz {
  const { calendar, monthLabels, counters, ticker } = options;
  const words = options.words ?? { ticker: 'contributions', one: 'contribution', many: 'contributions' };
  const weekdayGutter = options.weekdayGutter ?? WEEKDAY_LABELS;

  const firstDate = calendar[0]?.[0] ?? '2024-01-01';
  const totalWeeks = Math.max(1, Math.ceil((weekdayOf(firstDate) + calendar.length) / 7));

  // Distinct YYYY-MM in order; index i lines up with monthLabels[i], so a
  // trimmed window only needs to know where inside this list it starts.
  const monthKeys: string[] = [];
  for (const [date] of calendar) {
    const key = date.slice(0, 7);
    if (monthKeys[monthKeys.length - 1] !== key) monthKeys.push(key);
  }

  function buildWindow(requested: number): Window {
    let start = Math.max(0, calendar.length - requested * 7);
    // Snap a trimmed window forward to a Monday so column 0 is a whole week.
    // The untrimmed window keeps its partial first column instead, so showing
    // everything really does show every day.
    if (start > 0) {
      while (start < calendar.length && weekdayOf(calendar[start]![0]) !== 0) start++;
    }
    const slice = calendar.slice(start);
    const offset = slice.length ? weekdayOf(slice[0]![0]) : 0;

    const monthOffset = slice.length ? monthKeys.indexOf(slice[0]![0].slice(0, 7)) : 0;
    const monthTotals: number[] = [];
    const cells: Cell[] = slice.map(([date, count], i) => {
      const monthIndex = Math.max(0, monthKeys.indexOf(date.slice(0, 7)) - monthOffset);
      monthTotals[monthIndex] = (monthTotals[monthIndex] ?? 0) + count;
      return {
        week: Math.floor((i + offset) / 7),
        weekday: (i + offset) % 7,
        date,
        count,
        monthIndex,
      };
    });

    const weeks = (cells[cells.length - 1]?.week ?? 0) + 1;
    const weekPrefix: number[] = new Array(weeks + 1).fill(0);
    for (const cell of cells) weekPrefix[cell.week + 1]! += cell.count;
    for (let i = 1; i <= weeks; i++) weekPrefix[i]! += weekPrefix[i - 1]!;

    const maxCount = Math.max(1, ...cells.map((c) => c.count));
    return {
      requested,
      weeks,
      cells,
      logMax: Math.log1p(maxCount),
      weekPrefix,
      total: weekPrefix[weeks]! || 1,
      monthOffset,
      monthTotals,
    };
  }

  const measuredWidth = () => canvas.clientWidth || canvas.parentElement?.clientWidth || 900;
  const heightFor = (width: number) =>
    GUTTER_TOP + 7 * (cellFor(width, weeksFor(width, totalWeeks)) + GAP) + 18;

  let win = buildWindow(weeksFor(measuredWidth(), totalWeeks));
  describe();

  let lastProgress = 0;
  const context = setupCanvas(canvas, heightFor, () => render(lastProgress));

  function describe(): void {
    const label = options.describeWindow?.(win.weeks, totalWeeks);
    if (label) canvas.setAttribute('aria-label', label);
  }

  function geometry() {
    const width = cssWidth(canvas);
    const requested = weeksFor(width, totalWeeks);
    if (requested !== win.requested) {
      win = buildWindow(requested);
      describe();
    }
    const cell = cellFor(width, requested);
    return { width, cell, step: cell + GAP };
  }

  function render(progress: number): void {
    lastProgress = progress;
    const { width, cell, step } = geometry();
    const { cells, weeks, weekPrefix, total, logMax, monthOffset, monthTotals } = win;
    context.clearRect(0, 0, width, canvas.height);

    const scanWeek = progress * weeks;
    const scanX = GUTTER_LEFT + scanWeek * step;

    context.font = '9px "JetBrains Mono", monospace';
    context.fillStyle = themeColor('--color-faint');
    weekdayGutter.forEach((label, row) => {
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
              ((weekPrefix[Math.min(Math.floor(scanWeek) + 1, weeks)] ?? total) -
                weekPrefix[Math.floor(scanWeek)]!)) /
          total;
    counters.contributions.element.textContent = formatInt(counters.contributions.target * revealedShare);
    counters.prsMerged.element.textContent = formatInt(counters.prsMerged.target * revealedShare);
    counters.streak.element.textContent = formatInt(counters.streak.target * eased);

    if (ticker) {
      const months = Math.max(1, monthTotals.length);
      const monthIndex = Math.min(
        months - 1,
        Math.floor((progress >= 1 ? 0.9999 : progress) * months),
      );
      const label = monthLabels[monthOffset + monthIndex] ?? '';
      const monthTotal = monthTotals[monthIndex] ?? 0;
      ticker.textContent = `${label} · ${formatInt(monthTotal)} ${words.ticker}`;
    }
  }

  attachTooltip(canvas, (x, y) => {
    const { cell, step } = geometry();
    const week = Math.floor((x - GUTTER_LEFT) / step);
    const weekday = Math.floor((y - GUTTER_TOP) / step);
    if (week < 0 || weekday < 0 || weekday > 6) return null;
    const inCell = (x - GUTTER_LEFT) % step <= cell && (y - GUTTER_TOP) % step <= cell;
    if (!inCell) return null;
    const hit = win.cells.find((c) => c.week === week && c.weekday === weekday);
    if (!hit) return null;
    return `${hit.date} · ${formatInt(hit.count)} ${hit.count === 1 ? words.one : words.many}`;
  });

  return { render, durationMs: 9000 };
}
