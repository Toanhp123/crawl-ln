export type LibrarySearchScope = 'novels' | 'content';

export function novelPageClampTarget(
  scope: LibrarySearchScope,
  page: number,
  totalPages: number
): number | null {
  return scope === 'novels' && page > totalPages ? totalPages : null;
}
