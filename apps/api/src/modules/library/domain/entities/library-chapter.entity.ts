import { LibraryError } from '../errors/library.error.js';
import type { LibraryChapter, LibraryChapterStatus } from '../library.models.js';
import { assertHttpUrl, assertNonBlank, assertTimestamp } from '../library.validation.js';

export interface ReconcileLibraryChapterSource {
  index: number;
  title: string;
  sourceUrl: string;
  analyzedAt: string;
}

const statuses: readonly LibraryChapterStatus[] = ['pending', 'fetched', 'failed'];

function validateChapter(chapter: LibraryChapter): void {
  assertNonBlank(chapter.id, 'id');
  assertNonBlank(chapter.novelId, 'novelId');
  if (!Number.isInteger(chapter.index) || chapter.index < 0) {
    throw LibraryError.validation('index must be a non-negative integer', {
      field: 'index',
      value: chapter.index
    });
  }
  assertNonBlank(chapter.title, 'title');
  assertHttpUrl(chapter.sourceUrl, 'sourceUrl');
  if (!statuses.includes(chapter.status)) {
    throw LibraryError.validation('status is invalid', { field: 'status', value: chapter.status });
  }
  if (typeof chapter.sourceAvailable !== 'boolean') {
    throw LibraryError.validation('sourceAvailable must be a boolean', {
      field: 'sourceAvailable',
      value: chapter.sourceAvailable
    });
  }
  if (!Number.isInteger(chapter.contentVersion) || chapter.contentVersion < 1) {
    throw LibraryError.validation('contentVersion must be a positive integer', {
      field: 'contentVersion',
      value: chapter.contentVersion
    });
  }
  assertTimestamp(chapter.createdAt, 'createdAt');
  assertTimestamp(chapter.updatedAt, 'updatedAt');
}

export class LibraryChapterEntity {
  private constructor(private readonly props: Readonly<LibraryChapter>) {}

  static create(props: LibraryChapter): LibraryChapterEntity {
    validateChapter(props);
    return new LibraryChapterEntity(Object.freeze({ ...props }));
  }

  reconcileSource(source: ReconcileLibraryChapterSource): LibraryChapterEntity {
    return LibraryChapterEntity.create({
      ...this.props,
      index: source.index,
      title: source.title,
      sourceUrl: source.sourceUrl,
      sourceAvailable: true,
      updatedAt: source.analyzedAt
    });
  }

  saveContent(
    rawText: string | undefined,
    cleanText: string | undefined,
    savedAt: string,
    title = this.props.title
  ) {
    if (rawText === undefined && cleanText === undefined) return this;

    const nextRawText = rawText ?? this.props.rawText;
    const nextCleanText = cleanText ?? this.props.cleanText;
    const contentChanged =
      nextRawText !== this.props.rawText || nextCleanText !== this.props.cleanText;
    const metadataChanged = title !== this.props.title;
    const stateChanged = this.props.status !== 'fetched' || this.props.errorMessage !== undefined;
    if (!contentChanged && !metadataChanged && !stateChanged) return this;

    return LibraryChapterEntity.create({
      ...this.props,
      title,
      rawText: nextRawText,
      cleanText: nextCleanText,
      status: 'fetched',
      errorMessage: undefined,
      contentVersion: this.props.contentVersion + (contentChanged ? 1 : 0),
      updatedAt: savedAt
    });
  }

  toPrimitives(): LibraryChapter {
    return { ...this.props };
  }
}
