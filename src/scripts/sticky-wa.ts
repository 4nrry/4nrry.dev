/**
 * Mobile reach-me bar. The bar ships visible so a visitor without JS still gets
 * the CTA; this only tucks it away while one of the inline WhatsApp buttons is
 * already on screen, so the hero and the final CTA are never shadowed by a
 * duplicate of themselves.
 *
 * The observer watches the inline buttons, never the bar: the bar is
 * position:fixed and therefore always intersects the viewport, so asking about
 * its visibility would answer the wrong question.
 */
export function wireStickyWhatsApp(doc: Document = document): () => void {
  const bar = doc.querySelector<HTMLElement>('[data-sticky-wa]');
  if (!bar) return () => {};
  const inline = [...doc.querySelectorAll<HTMLElement>('[data-wa-inline]')];
  if (!inline.length) return () => {};

  const onScreen = new Set<Element>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      }
      bar.toggleAttribute('data-tucked', onScreen.size > 0);
    },
    { threshold: 0 },
  );

  for (const button of inline) observer.observe(button);
  return () => observer.disconnect();
}
