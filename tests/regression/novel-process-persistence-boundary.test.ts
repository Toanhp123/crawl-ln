import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryPath = new URL(
  '../../apps/api/src/modules/novels/domain/repositories/novel.repository.ts',
  import.meta.url
);
const analyzeUseCasePath = new URL(
  '../../apps/api/src/modules/novels/application/use-cases/analyze-novel.usecase.ts',
  import.meta.url
);
const deleteUseCasePath = new URL(
  '../../apps/api/src/modules/novels/application/use-cases/commands/delete-novel.usecase.ts',
  import.meta.url
);

test('NovelRepository stays novel-only and process transactions use application ports', async () => {
  const [repository, analyzeUseCase, deleteUseCase] = await Promise.all([
    readFile(repositoryPath, 'utf8'),
    readFile(analyzeUseCasePath, 'utf8'),
    readFile(deleteUseCasePath, 'utf8')
  ]);

  assert.doesNotMatch(repository, /\b(?:saveNovel|deleteById|findChapter|updateChapter)\s*\(/);
  assert.match(analyzeUseCase, /NovelAnalysisPersistencePort/);
  assert.match(analyzeUseCase, /this\.persistence\.persist\(novel, chapters\)/);
  assert.match(deleteUseCase, /NovelDeletionPort/);
  assert.match(deleteUseCase, /this\.deletion\.delete\(id\)/);
});
