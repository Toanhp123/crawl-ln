export type SearchDocumentType = 'all' | 'novel' | 'chapter';
export type SearchQuery = {
  query: string;
  type: SearchDocumentType;
  novelId?: string;
  limit: number;
  offset: number;
};
export type SearchResultItem = {
  type: 'novel' | 'chapter';
  documentId: string;
  novelId: string;
  novelTitle: string;
  chapterIndex?: number;
  title: string;
  snippet: string;
};
export type SearchResultPage = {
  query: string;
  total: number;
  limit: number;
  offset: number;
  items: SearchResultItem[];
};
