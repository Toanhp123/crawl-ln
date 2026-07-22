export function searchPageClampTarget(
  page: number,
  totalPages: number,
  isPlaceholderData: boolean
): number | null {
  return !isPlaceholderData && page > totalPages ? totalPages : null;
}
