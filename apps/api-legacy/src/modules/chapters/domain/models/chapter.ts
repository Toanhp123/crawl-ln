export type ChapterStatus = 'pending' | 'fetched' | 'failed';

export type Chapter = {
  id: string;
  novelId: string;
  index: number;
  title: string;
  sourceUrl: string;
  rawText?: string;
  cleanText?: string;
  status: ChapterStatus;
  errorMessage?: string;
  contentVersion: number;
};
