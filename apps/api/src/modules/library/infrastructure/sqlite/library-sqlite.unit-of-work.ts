import { LibraryChapterEntity } from '../../domain/entities/library-chapter.entity.js';
import { LibraryNovelEntity } from '../../domain/entities/library-novel.entity.js';
import { LibraryError } from '../../domain/errors/library.error.js';
import type {
  DeleteLibraryNovelCommand,
  ReconcileAnalysisCommand,
  SaveChapterContentCommand,
  SetLibraryIngestionStateCommand
} from '../../domain/library.contracts.js';
import type { LibraryChapter, LibraryNovelDetail } from '../../domain/library.models.js';
import type { LibraryUnitOfWork } from '../../domain/repositories/library.repository.js';
import { chapterSourceUrlKey } from '../../domain/url/chapter-source-url-key.js';
import { assertNonBlank, assertTimestamp } from '../../domain/library.validation.js';
import {
  LIBRARY_ANALYSIS_RECONCILED,
  LIBRARY_CHAPTER_CONTENT_SAVED,
  LIBRARY_NOVEL_DELETED,
  type LibraryAnalysisReconciledPayload,
  type LibraryChapterContentSavedPayload,
  type LibraryNovelDeletedPayload
} from '../../public/library.events.js';
import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import {
  libraryCommandReceiptRowSchema,
  parseLibraryChapter,
  parseLibraryNovelDetail
} from './library-row.schemas.js';
import { LibrarySqliteRepository } from './library-sqlite.repository.js';

const commandTypes = {
  reconcileAnalysis: 'reconcile-analysis',
  saveChapterContent: 'save-chapter-content',
  setIngestionState: 'set-ingestion-state',
  deleteNovel: 'delete-novel'
} as const;

function canonicalDetail(detail: LibraryNovelDetail): {
  detail: LibraryNovelDetail;
  json: string;
} {
  const json = JSON.stringify(detail);
  return { detail: parseLibraryNovelDetail(JSON.parse(json)), json };
}

function canonicalChapter(chapter: LibraryChapter): {
  chapter: LibraryChapter;
  json: string;
} {
  const json = JSON.stringify(chapter);
  return { chapter: parseLibraryChapter(JSON.parse(json)), json };
}

export class LibrarySqliteUnitOfWork implements LibraryUnitOfWork {
  private readonly repository: LibrarySqliteRepository;

  constructor(
    private readonly database: SqliteDatabase,
    repository?: LibrarySqliteRepository
  ) {
    this.repository = repository ?? new LibrarySqliteRepository(database);
  }

  reconcileAnalysis(command: ReconcileAnalysisCommand): LibraryNovelDetail {
    return this.database.transactionSync(() => {
      const receipt = this.readReceipt(command.commandId, commandTypes.reconcileAnalysis);
      if (receipt) {
        if (receipt.result_json === null) this.throwReceiptConflict(command.commandId);
        return parseLibraryNovelDetail(JSON.parse(receipt.result_json));
      }

      assertNonBlank(command.commandId, 'commandId');
      assertTimestamp(command.analyzedAt, 'analyzedAt');
      const current = this.repository.readNovelBySourceUrl(command.novel.sourceUrl);
      const novel = current
        ? LibraryNovelEntity.create(current.novel).reconcile({
            title: command.novel.title,
            sourceName: command.novel.sourceName,
            author: command.novel.author,
            coverUrl: command.novel.coverUrl,
            analyzedAt: command.analyzedAt
          })
        : LibraryNovelEntity.create({
            ...command.novel,
            status: 'analyzed',
            createdAt: command.analyzedAt,
            updatedAt: command.analyzedAt
          });
      const novelProps = novel.toPrimitives();

      if (current) {
        this.database.connection
          .prepare(
            `UPDATE library_novels
                SET title = ?, source_name = ?, author = ?, cover_url = ?, status = ?, updated_at = ?
              WHERE id = ?`
          )
          .run(
            novelProps.title,
            novelProps.sourceName,
            novelProps.author ?? null,
            novelProps.coverUrl ?? null,
            novelProps.status,
            novelProps.updatedAt,
            novelProps.id
          );
      } else {
        this.database.connection
          .prepare(
            `INSERT INTO library_novels
              (id, title, source_url, source_name, author, cover_url, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            novelProps.id,
            novelProps.title,
            novelProps.sourceUrl,
            novelProps.sourceName,
            novelProps.author ?? null,
            novelProps.coverUrl ?? null,
            novelProps.status,
            novelProps.createdAt,
            novelProps.updatedAt
          );
      }

      const existingChapters = this.repository.readChaptersByNovelId(novelProps.id, true);
      const existingBySource = new Map<string, (typeof existingChapters)[number]>();
      for (const chapter of existingChapters) {
        const key = chapterSourceUrlKey(chapter.sourceUrl);
        if (!existingBySource.has(key)) existingBySource.set(key, chapter);
      }

      const seenSourceKeys = new Set<string>();
      const matchedIds = new Set<string>();
      const reconciled = command.chapters.map((source) => {
        const key = chapterSourceUrlKey(source.sourceUrl);
        if (seenSourceKeys.has(key)) {
          throw new LibraryError('LIBRARY_CONFLICT', 'Analysis contains duplicate chapter URLs', {
            sourceUrl: source.sourceUrl
          });
        }
        seenSourceKeys.add(key);
        const existing = existingBySource.get(key);
        if (existing) matchedIds.add(existing.id);
        const entity = existing
          ? LibraryChapterEntity.create(existing).reconcileSource({
              index: source.index,
              title: source.title,
              sourceUrl: source.sourceUrl,
              analyzedAt: command.analyzedAt
            })
          : LibraryChapterEntity.create({
              id: source.id,
              novelId: novelProps.id,
              index: source.index,
              title: source.title,
              sourceUrl: source.sourceUrl,
              status: 'pending',
              sourceAvailable: true,
              contentVersion: 1,
              createdAt: command.analyzedAt,
              updatedAt: command.analyzedAt
            });
        return { existing: Boolean(existing), chapter: entity.toPrimitives() };
      });

      const largestIndex = Math.max(
        0,
        ...existingChapters.map((chapter) => chapter.index),
        ...reconciled.map(({ chapter }) => chapter.index)
      );
      const shift = Math.max(1_000_000, largestIndex + existingChapters.length + 1);
      this.database.connection
        .prepare('UPDATE library_chapters SET chapter_index = chapter_index + ? WHERE novel_id = ?')
        .run(shift, novelProps.id);
      this.database.connection
        .prepare('UPDATE library_chapters SET source_available = 0 WHERE novel_id = ?')
        .run(novelProps.id);

      const updateChapter = this.database.connection.prepare(
        `UPDATE library_chapters
            SET chapter_index = ?, title = ?, source_url = ?, source_available = 1, updated_at = ?
          WHERE id = ?`
      );
      const insertChapter = this.database.connection.prepare(
        `INSERT INTO library_chapters
          (id, novel_id, chapter_index, title, source_url, raw_text, clean_text, status,
           error_message, source_available, content_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const item of reconciled) {
        const chapter = item.chapter;
        if (item.existing) {
          updateChapter.run(
            chapter.index,
            chapter.title,
            chapter.sourceUrl,
            chapter.updatedAt,
            chapter.id
          );
        } else {
          insertChapter.run(
            chapter.id,
            chapter.novelId,
            chapter.index,
            chapter.title,
            chapter.sourceUrl,
            chapter.rawText ?? null,
            chapter.cleanText ?? null,
            chapter.status,
            chapter.errorMessage ?? null,
            chapter.sourceAvailable ? 1 : 0,
            chapter.contentVersion,
            chapter.createdAt,
            chapter.updatedAt
          );
        }
      }

      const missing = existingChapters.filter((chapter) => !matchedIds.has(chapter.id));
      let missingIndex = Math.max(-1, ...reconciled.map(({ chapter }) => chapter.index)) + 1;
      const moveMissing = this.database.connection.prepare(
        'UPDATE library_chapters SET chapter_index = ? WHERE id = ?'
      );
      for (const chapter of missing) moveMissing.run(missingIndex++, chapter.id);

      const stored = this.repository.readNovelById(novelProps.id);
      if (!stored)
        throw new LibraryError('LIBRARY_NOT_FOUND', 'Reconciled novel was not persisted');
      const result = canonicalDetail(stored);
      this.appendEvent(
        LIBRARY_ANALYSIS_RECONCILED,
        command.commandId,
        command.analyzedAt,
        JSON.stringify({
          commandId: command.commandId,
          novel: result.detail.novel,
          chapters: result.detail.chapters
        } satisfies LibraryAnalysisReconciledPayload)
      );
      this.recordReceipt(
        command.commandId,
        commandTypes.reconcileAnalysis,
        result.json,
        command.analyzedAt
      );
      return result.detail;
    });
  }

  saveChapterContent(command: SaveChapterContentCommand): LibraryChapter {
    return this.database.transactionSync(() => {
      const receipt = this.readReceipt(command.commandId, commandTypes.saveChapterContent);
      if (receipt) {
        if (receipt.result_json === null) this.throwReceiptConflict(command.commandId);
        return parseLibraryChapter(JSON.parse(receipt.result_json));
      }

      assertNonBlank(command.commandId, 'commandId');
      assertNonBlank(command.novelId, 'novelId');
      assertNonBlank(command.chapterId, 'chapterId');
      assertTimestamp(command.savedAt, 'savedAt');
      const current = this.repository.readChapterById(command.novelId, command.chapterId);
      if (!current) {
        throw new LibraryError('LIBRARY_NOT_FOUND', 'Library chapter was not found', {
          novelId: command.novelId,
          chapterId: command.chapterId
        });
      }
      const novelTitle = this.repository.readNovelTitleById(command.novelId);
      if (!novelTitle) {
        throw new LibraryError('LIBRARY_NOT_FOUND', 'Library novel was not found', {
          novelId: command.novelId
        });
      }
      const chapter = LibraryChapterEntity.create(current)
        .saveContent(command.rawText, command.cleanText, command.savedAt, command.title)
        .toPrimitives();
      this.database.connection
        .prepare(
          `UPDATE library_chapters
              SET title = ?, raw_text = ?, clean_text = ?, status = ?, error_message = ?,
                  content_version = ?, updated_at = ?
            WHERE id = ? AND novel_id = ? AND source_available = 1`
        )
        .run(
          chapter.title,
          chapter.rawText ?? null,
          chapter.cleanText ?? null,
          chapter.status,
          chapter.errorMessage ?? null,
          chapter.contentVersion,
          chapter.updatedAt,
          chapter.id,
          chapter.novelId
        );

      const result = canonicalChapter(chapter);
      this.appendEvent(
        LIBRARY_CHAPTER_CONTENT_SAVED,
        command.commandId,
        command.savedAt,
        JSON.stringify({
          commandId: command.commandId,
          novelTitle,
          chapter: result.chapter
        } satisfies LibraryChapterContentSavedPayload)
      );
      this.recordReceipt(
        command.commandId,
        commandTypes.saveChapterContent,
        result.json,
        command.savedAt
      );
      return result.chapter;
    });
  }

  setIngestionState(command: SetLibraryIngestionStateCommand): void {
    this.database.transactionSync(() => {
      const receipt = this.readReceipt(command.commandId, commandTypes.setIngestionState);
      if (receipt) {
        if (receipt.result_json !== null) this.throwReceiptConflict(command.commandId);
        return;
      }

      assertNonBlank(command.commandId, 'commandId');
      assertNonBlank(command.novelId, 'novelId');
      assertTimestamp(command.updatedAt, 'updatedAt');
      const current = this.repository.readNovelById(command.novelId);
      if (!current) {
        throw new LibraryError('LIBRARY_NOT_FOUND', 'Library novel was not found', {
          novelId: command.novelId
        });
      }
      const novel = LibraryNovelEntity.create(current.novel)
        .setIngestionState(command.status, command.updatedAt)
        .toPrimitives();
      this.database.connection
        .prepare('UPDATE library_novels SET status = ?, updated_at = ? WHERE id = ?')
        .run(novel.status, novel.updatedAt, novel.id);
      this.appendEvent(
        'library.ingestion-state-changed',
        command.commandId,
        command.updatedAt,
        JSON.stringify({
          commandId: command.commandId,
          novelId: novel.id,
          status: novel.status,
          ...(command.errorMessage === undefined ? {} : { errorMessage: command.errorMessage })
        })
      );
      this.recordReceipt(
        command.commandId,
        commandTypes.setIngestionState,
        null,
        command.updatedAt
      );
    });
  }

  deleteNovel(command: DeleteLibraryNovelCommand): void {
    this.database.transactionSync(() => {
      const receipt = this.readReceipt(command.commandId, commandTypes.deleteNovel);
      if (receipt) {
        if (receipt.result_json !== null) this.throwReceiptConflict(command.commandId);
        return;
      }

      assertNonBlank(command.commandId, 'commandId');
      assertNonBlank(command.novelId, 'novelId');
      assertTimestamp(command.deletedAt, 'deletedAt');
      if (!this.repository.readNovelById(command.novelId)) {
        throw new LibraryError('LIBRARY_NOT_FOUND', 'Library novel was not found', {
          novelId: command.novelId
        });
      }
      this.database.connection
        .prepare('DELETE FROM library_novels WHERE id = ?')
        .run(command.novelId);
      this.appendEvent(
        LIBRARY_NOVEL_DELETED,
        command.commandId,
        command.deletedAt,
        JSON.stringify({
          commandId: command.commandId,
          novelId: command.novelId
        } satisfies LibraryNovelDeletedPayload)
      );
      this.recordReceipt(command.commandId, commandTypes.deleteNovel, null, command.deletedAt);
    });
  }

  private readReceipt(commandId: string, expectedType: string) {
    const input = this.database.connection
      .prepare('SELECT * FROM library_command_receipts WHERE command_id = ?')
      .get(commandId);
    if (!input) return undefined;
    const receipt = libraryCommandReceiptRowSchema.parse(input);
    if (receipt.command_type !== expectedType) this.throwReceiptConflict(commandId);
    return receipt;
  }

  private recordReceipt(
    commandId: string,
    type: string,
    resultJson: string | null,
    createdAt: string
  ): void {
    this.database.connection
      .prepare(
        `INSERT INTO library_command_receipts(command_id, command_type, result_json, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(commandId, type, resultJson, createdAt);
  }

  private appendEvent(
    type: string,
    commandId: string,
    occurredAt: string,
    payloadJson: string
  ): void {
    this.database.connection
      .prepare(
        `INSERT INTO library_outbox(id, type, occurred_at, payload_json)
         VALUES (?, ?, ?, ?)`
      )
      .run(`${type}:${commandId}`, type, occurredAt, payloadJson);
  }

  private throwReceiptConflict(commandId: string): never {
    throw new LibraryError(
      'LIBRARY_CONFLICT',
      `Command ID ${commandId} belongs to another Library operation`
    );
  }
}
