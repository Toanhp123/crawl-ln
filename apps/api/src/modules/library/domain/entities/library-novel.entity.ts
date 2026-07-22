import { LibraryError } from '../errors/library.error.js';
import type { LibraryNovel, LibraryNovelStatus } from '../library.models.js';
import { assertHttpUrl, assertNonBlank, assertTimestamp } from '../library.validation.js';

export interface ReconcileLibraryNovelSource {
  title: string;
  sourceName: string;
  author?: string;
  coverUrl?: string;
  analyzedAt: string;
}

const statuses: readonly LibraryNovelStatus[] = ['analyzed', 'crawling', 'completed', 'failed'];

const allowedTransitions: Record<LibraryNovelStatus, readonly LibraryNovelStatus[]> = {
  analyzed: ['crawling'],
  crawling: ['completed', 'failed'],
  completed: ['crawling'],
  failed: ['crawling']
};

function validateNovel(novel: LibraryNovel): void {
  assertNonBlank(novel.id, 'id');
  assertNonBlank(novel.title, 'title');
  assertHttpUrl(novel.sourceUrl, 'sourceUrl');
  assertNonBlank(novel.sourceName, 'sourceName');
  if (novel.coverUrl !== undefined) assertHttpUrl(novel.coverUrl, 'coverUrl');
  if (!statuses.includes(novel.status)) {
    throw LibraryError.validation('status is invalid', { field: 'status', value: novel.status });
  }
  assertTimestamp(novel.createdAt, 'createdAt');
  assertTimestamp(novel.updatedAt, 'updatedAt');
}

export class LibraryNovelEntity {
  private constructor(private readonly props: Readonly<LibraryNovel>) {}

  static create(props: LibraryNovel): LibraryNovelEntity {
    validateNovel(props);
    return new LibraryNovelEntity(Object.freeze({ ...props }));
  }

  reconcile(source: ReconcileLibraryNovelSource): LibraryNovelEntity {
    const next: LibraryNovel = {
      ...this.props,
      title: source.title,
      sourceName: source.sourceName,
      author: source.author,
      coverUrl: source.coverUrl,
      status: 'analyzed',
      updatedAt: source.analyzedAt
    };
    return LibraryNovelEntity.create(next);
  }

  setIngestionState(status: LibraryNovelStatus, updatedAt: string): LibraryNovelEntity {
    if (status === this.props.status) return this;
    if (!allowedTransitions[this.props.status].includes(status)) {
      throw LibraryError.invalidTransition(this.props.status, status);
    }
    return LibraryNovelEntity.create({ ...this.props, status, updatedAt });
  }

  toPrimitives(): LibraryNovel {
    return { ...this.props };
  }
}
