export const chapterKeys = {
  all: ['chapters'] as const,
  byNovel: (novelId: string) => ['chapters', 'novel', novelId] as const,
  detail: (novelId: string, index: number) => ['chapters', 'detail', novelId, index] as const
};
