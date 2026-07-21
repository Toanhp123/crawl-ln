export type ExportFileFormat = 'epub' | 'txt';

export interface ExportOptions {
  format: ExportFileFormat;
  range?: { from?: number; to?: number };
  downloadedOnly: boolean;
}

export interface ExportNovel {
  id: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  status: 'analyzed' | 'crawling' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface ExportChapter {
  id: string;
  novelId: string;
  index: number;
  title: string;
  sourceUrl: string;
  rawText?: string;
  cleanText?: string;
  status: 'pending' | 'fetched' | 'failed';
  errorMessage?: string;
}

export interface ExportBook {
  novel: ExportNovel;
  chapters: ExportChapter[];
}

export interface ExportArtifact {
  filename: string;
  contentType: string;
  content: Buffer;
  chapterCount: number;
}
