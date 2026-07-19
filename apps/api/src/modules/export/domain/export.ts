export type ExportFileFormat = 'epub' | 'txt';
export type ExportOptions = {
  format: ExportFileFormat;
  range?: { from?: number; to?: number };
  downloadedOnly: boolean;
};

export type ExportNovel = {
  id: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  status: 'analyzed' | 'crawling' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
};

export type ExportChapter = {
  id: string;
  novelId: string;
  index: number;
  title: string;
  sourceUrl: string;
  rawText?: string;
  cleanText?: string;
  status: 'pending' | 'fetched' | 'failed';
  errorMessage?: string;
};

export type ExportBook = { novel: ExportNovel; chapters: ExportChapter[] };
export type ExportArtifact = {
  filename: string;
  contentType: string;
  content: Buffer;
  chapterCount: number;
};
