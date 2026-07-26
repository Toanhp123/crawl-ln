import { ReaderChapterSource } from './chapter-source.js';
import type {
  CreateReaderSessionOptions,
  ReaderChapterIdentity,
  ReaderLoadingState,
  ReaderSession,
  ReaderSessionSnapshot
} from './contracts.js';
import {
  appendReaderChapter,
  createReaderWindow,
  prependReaderChapter,
  type ReaderWindow
} from './reader-window.js';

type Direction = 'previous' | 'next';

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function uniqueSortedIdentities(
  identities: readonly ReaderChapterIdentity[]
): readonly ReaderChapterIdentity[] {
  const byId = new Map<string, ReaderChapterIdentity>();
  for (const identity of identities) byId.set(identity.id, identity);
  return [...byId.values()].sort((left, right) => left.index - right.index);
}

export function createReaderSession<TChapter extends ReaderChapterIdentity>(
  options: CreateReaderSessionOptions<TChapter>
): ReaderSession<TChapter> {
  const source = new ReaderChapterSource(options.cache, options.loader, options.persistentCache);
  const listeners = new Set<(snapshot: ReaderSessionSnapshot<TChapter>) => void>();

  let generation = 0;
  let controller: AbortController | null = null;
  let novelId: string | null = null;
  let identities: readonly ReaderChapterIdentity[] = [];
  let activeIndex = 0;
  let chapterWindow: ReaderWindow<TChapter> = { chapters: [] };
  let loading: ReaderLoadingState = 'idle';
  let error: unknown | null = null;
  let retryAction: (() => Promise<void>) | null = null;
  const pendingLoads = new Map<string, Promise<TChapter>>();
  let previousPromise: Promise<boolean> | null = null;
  let nextPromise: Promise<boolean> | null = null;

  function positionFor(chapter: ReaderChapterIdentity): number {
    const byId = identities.findIndex((identity) => identity.id === chapter.id);
    return byId >= 0 ? byId : identities.findIndex((identity) => identity.index === chapter.index);
  }

  function currentSnapshot(): ReaderSessionSnapshot<TChapter> {
    const first = chapterWindow.chapters[0];
    const last = chapterWindow.chapters.at(-1);
    const firstPosition = first ? positionFor(first) : -1;
    const lastPosition = last ? positionFor(last) : -1;
    return {
      chapters: [...chapterWindow.chapters],
      activeIndex,
      loading,
      error,
      hasPrevious: firstPosition > 0,
      hasNext: lastPosition >= 0 && lastPosition < identities.length - 1
    };
  }

  function emit(): void {
    const value = currentSnapshot();
    for (const listener of listeners) listener(value);
  }

  function replaceController(): { id: number; signal: AbortSignal } {
    controller?.abort();
    controller = new AbortController();
    generation += 1;
    previousPromise = null;
    nextPromise = null;
    pendingLoads.clear();
    return { id: generation, signal: controller.signal };
  }

  function identityAt(index: number): ReaderChapterIdentity | null {
    return identities.find((identity) => identity.index === index) ?? null;
  }

  function adjacentTo(chapter: ReaderChapterIdentity, direction: -1 | 1) {
    const position = positionFor(chapter);
    return position < 0 ? null : (identities[position + direction] ?? null);
  }

  function loadIdentity(
    currentNovelId: string,
    identity: ReaderChapterIdentity,
    signal: AbortSignal
  ): Promise<TChapter> {
    const key = `${currentNovelId}:${identity.id}:${identity.contentVersion}`;
    const existing = pendingLoads.get(key);
    if (existing) return existing;
    const load = source.load(currentNovelId, identity, signal);
    pendingLoads.set(key, load);
    void load
      .finally(() => {
        if (pendingLoads.get(key) === load) pendingLoads.delete(key);
      })
      .catch(() => undefined);
    return load;
  }

  function prefetch(identity: ReaderChapterIdentity | null): void {
    if (!identity || !novelId || !controller || controller.signal.aborted) return;
    const currentNovelId = novelId;
    const signal = controller.signal;
    void loadIdentity(currentNovelId, identity, signal).catch(() => undefined);
  }

  async function start(
    nextNovelId: string,
    nextIdentities: readonly ReaderChapterIdentity[],
    nextActiveIndex: number
  ): Promise<void> {
    const current = replaceController();
    novelId = nextNovelId;
    identities = uniqueSortedIdentities(nextIdentities);
    activeIndex = nextActiveIndex;
    chapterWindow = { chapters: [] };
    loading = 'initial';
    error = null;
    retryAction = () => start(nextNovelId, nextIdentities, nextActiveIndex);
    emit();

    const identity = identityAt(nextActiveIndex);
    if (!identity) {
      const caught = new RangeError(`Reader chapter index ${nextActiveIndex} is unavailable`);
      if (current.id === generation) {
        loading = 'idle';
        error = caught;
        emit();
      }
      throw caught;
    }

    try {
      const chapter = await loadIdentity(nextNovelId, identity, current.signal);
      if (current.id !== generation || current.signal.aborted) return;
      chapterWindow = createReaderWindow(chapter);
      loading = 'idle';
      error = null;
      emit();
      prefetch(adjacentTo(chapter, -1));
      prefetch(adjacentTo(chapter, 1));
    } catch (caught) {
      if (current.id !== generation || isAbortError(caught)) return;
      loading = 'idle';
      error = caught;
      emit();
      throw caught;
    }
  }

  async function loadDirection(direction: Direction): Promise<boolean> {
    const existing = direction === 'previous' ? previousPromise : nextPromise;
    if (existing) return existing;
    if (
      !novelId ||
      !controller ||
      controller.signal.aborted ||
      chapterWindow.chapters.length === 0
    ) {
      return false;
    }
    if (loading !== 'idle') return false;

    const edge =
      direction === 'previous' ? chapterWindow.chapters[0] : chapterWindow.chapters.at(-1)!;
    const identity = adjacentTo(edge, direction === 'previous' ? -1 : 1);
    if (!identity) return false;

    const currentGeneration = generation;
    const currentNovelId = novelId;
    const signal = controller.signal;
    const operation = (async () => {
      loading = direction;
      error = null;
      retryAction = async () => {
        await loadDirection(direction);
      };
      emit();
      try {
        const chapter = await loadIdentity(currentNovelId, identity, signal);
        if (currentGeneration !== generation || signal.aborted) return false;
        chapterWindow =
          direction === 'previous'
            ? prependReaderChapter(chapterWindow, chapter)
            : appendReaderChapter(chapterWindow, chapter);
        loading = 'idle';
        error = null;
        emit();
        prefetch(adjacentTo(chapter, direction === 'previous' ? -1 : 1));
        return true;
      } catch (caught) {
        if (currentGeneration !== generation || isAbortError(caught)) return false;
        loading = 'idle';
        error = caught;
        emit();
        return false;
      } finally {
        if (direction === 'previous') previousPromise = null;
        else nextPromise = null;
      }
    })();

    if (direction === 'previous') previousPromise = operation;
    else nextPromise = operation;
    return operation;
  }

  return {
    start,
    loadPrevious: () => loadDirection('previous'),
    loadNext: () => loadDirection('next'),
    setActiveIndex(nextActiveIndex) {
      if (!identityAt(nextActiveIndex)) return;
      activeIndex = nextActiveIndex;
      error = null;
      emit();
      const active = chapterWindow.chapters.find((chapter) => chapter.index === activeIndex);
      if (active) {
        prefetch(adjacentTo(active, -1));
        prefetch(adjacentTo(active, 1));
      }
    },
    async retry() {
      if (!retryAction) return;
      error = null;
      emit();
      await retryAction();
    },
    cancel() {
      controller?.abort();
      controller = null;
      generation += 1;
      previousPromise = null;
      nextPromise = null;
      pendingLoads.clear();
      loading = 'idle';
      emit();
    },
    snapshot: currentSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(currentSnapshot());
      return () => listeners.delete(listener);
    }
  };
}
