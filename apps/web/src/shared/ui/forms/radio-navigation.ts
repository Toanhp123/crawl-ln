export type RadioDirection = -1 | 1;

export function nextEnabledIndex(
  items: ReadonlyArray<{ disabled?: boolean }>,
  currentIndex: number,
  direction: RadioDirection
): number {
  if (items.length === 0) return -1;
  for (let offset = 1; offset <= items.length; offset += 1) {
    const index = (currentIndex + direction * offset + items.length) % items.length;
    if (!items[index]?.disabled) return index;
  }
  return currentIndex;
}
