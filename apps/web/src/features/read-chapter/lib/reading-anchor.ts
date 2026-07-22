import { paragraphDomId } from '../../../entities/chapter';

export const READER_PARAGRAPH_SELECTOR = '[data-reader-paragraph]';

export interface ReadingAnchorSnapshot {
  paragraphId: string;
  paragraphOffset: number;
  scrollRatio: number;
}

export function captureReadingAnchor(
  viewport: HTMLElement,
  root: ParentNode = viewport
): ReadingAnchorSnapshot {
  const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const scrollRatio = maxScroll > 0 ? viewport.scrollTop / maxScroll : 0;
  const viewportRect = viewport.getBoundingClientRect();
  const probeY =
    viewportRect.top +
    Math.min(viewport.clientHeight - 1, Math.max(1, viewport.clientHeight * 0.32));
  const paragraphs = Array.from(root.querySelectorAll<HTMLElement>(READER_PARAGRAPH_SELECTOR));
  const active =
    paragraphs.find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top <= probeY && rect.bottom > probeY;
    }) ??
    paragraphs.find((element) => element.getBoundingClientRect().bottom > probeY) ??
    paragraphs.at(-1);

  if (!active) return { paragraphId: '', paragraphOffset: 0, scrollRatio };
  const rect = active.getBoundingClientRect();
  return {
    paragraphId: active.id,
    paragraphOffset: Math.max(0, probeY - rect.top),
    scrollRatio
  };
}

export function restoreReadingAnchor(
  anchor: ReadingAnchorSnapshot,
  viewport: HTMLElement,
  root: ParentNode = viewport
): boolean {
  if (anchor.paragraphId) {
    const paragraph = document.getElementById(anchor.paragraphId);
    if (paragraph && (root === document || (root instanceof Node && root.contains(paragraph)))) {
      const viewportRect = viewport.getBoundingClientRect();
      const top =
        viewport.scrollTop +
        paragraph.getBoundingClientRect().top -
        viewportRect.top +
        anchor.paragraphOffset -
        viewport.clientHeight * 0.32;
      viewport.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
      return true;
    }
  }

  const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  viewport.scrollTo({
    top: maxScroll * Math.max(0, Math.min(1, anchor.scrollRatio)),
    behavior: 'auto'
  });
  return false;
}

export { paragraphDomId };
