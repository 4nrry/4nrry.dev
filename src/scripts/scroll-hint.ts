/**
 * Affordance and keyboard access for the blocks that scroll sideways.
 *
 * A wide diagram inside `overflow-x: auto` never overflows on a desktop, so the
 * only visitors who ever have to scroll it are the ones whose browser draws no
 * scrollbar. The mask in global.css fades whichever edge still has content
 * behind it; this decides which edge that is, and hands the region a tabindex
 * while it overflows so it can also be scrolled without a pointer.
 */

/** Slack in px: sub-pixel layout means scrollLeft rarely lands on an integer. */
const EDGE = 2;

export function wireScrollHints(root: ParentNode = document): () => void {
  const boxes = [...root.querySelectorAll<HTMLElement>('[data-scroll-x]')];
  if (!boxes.length) return () => {};

  const sync = (box: HTMLElement): void => {
    const overflow = box.scrollWidth - box.clientWidth;
    if (overflow <= EDGE) {
      delete box.dataset.hint;
      box.removeAttribute('tabindex');
      return;
    }
    box.setAttribute('tabindex', '0');
    const atStart = box.scrollLeft <= EDGE;
    const atEnd = box.scrollLeft >= overflow - EDGE;
    box.dataset.hint = atStart ? 'end' : atEnd ? 'start' : 'both';
  };

  for (const box of boxes) {
    box.addEventListener('scroll', () => sync(box), { passive: true });
  }

  // The mask changes nothing about the box's size, so this cannot re-trigger
  // itself. `details` opening is also a resize, which is how the tables inside
  // a closed disclosure get measured at the right moment.
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) sync(entry.target as HTMLElement);
  });
  for (const box of boxes) observer.observe(box);

  for (const box of boxes) sync(box);
  return () => observer.disconnect();
}
