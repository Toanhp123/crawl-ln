export type SearchDocumentType = 'all' | 'novel' | 'chapter';

export interface SearchQuery {
  query: string;
  type: SearchDocumentType;
  novelId?: string;
  limit: number;
  offset: number;
}

export interface SearchDocument {
  type: 'novel' | 'chapter';
  documentId: string;
  novelId: string;
  chapterIndex?: number;
  title: string;
  subtitle: string;
  content: string;
}

export interface SearchResultItem {
  type: 'novel' | 'chapter';
  documentId: string;
  novelId: string;
  novelTitle: string;
  chapterIndex?: number;
  title: string;
  snippet: string;
}

export interface SearchResultPage {
  query: string;
  total: number;
  limit: number;
  offset: number;
  items: SearchResultItem[];
}
