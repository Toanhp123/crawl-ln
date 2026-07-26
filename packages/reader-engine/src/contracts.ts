export interface ReaderChapterIdentity {
  id: string;
  index: number;
  contentVersion: number;
}

export interface ReaderChapterCache<TChapter extends ReaderChapterIdentity> {
  get(novelId: string, identity: ReaderChapterIdentity): Promise<TChapter | null>;
  set(novelId: string, chapter: TChapter): Promise<void>;
}

export interface ReaderChapterLoader<TChapter extends ReaderChapterIdentity> {
  load(novelId: string, index: number, signal: AbortSignal): Promise<TChapter>;
}

export interface ReaderChapterSourceApi<TChapter extends ReaderChapterIdentity> {
  load(novelId: string, identity: ReaderChapterIdentity, signal: AbortSignal): Promise<TChapter>;
}

export type ReaderLoadingState = 'idle' | 'initial' | 'previous' | 'next';

export interface ReaderSessionSnapshot<TChapter extends ReaderChapterIdentity> {
  chapters: readonly TChapter[];
  activeIndex: number;
  loading: ReaderLoadingState;
  error: unknown | null;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface CreateReaderSessionOptions<TChapter extends ReaderChapterIdentity> {
  loader: ReaderChapterLoader<TChapter>;
  cache: ReaderChapterCache<TChapter>;
  persistentCache?: ReaderChapterCache<TChapter>;
}

export interface ReaderSession<TChapter extends ReaderChapterIdentity> {
  start(
    novelId: string,
    chapters: readonly ReaderChapterIdentity[],
    activeIndex: number
  ): Promise<void>;
  loadPrevious(): Promise<boolean>;
  loadNext(): Promise<boolean>;
  setActiveIndex(index: number): void;
  retry(): Promise<void>;
  cancel(): void;
  snapshot(): ReaderSessionSnapshot<TChapter>;
  subscribe(listener: (snapshot: ReaderSessionSnapshot<TChapter>) => void): () => void;
}
