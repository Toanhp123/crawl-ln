import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildAxiosRequestConfig } from '../../apps/api-legacy/src/shared/infrastructure/http/axios-http-client.adapter.ts';
import {
  abortableSleep,
  computeRetryDelayMs
} from '../../apps/api-legacy/src/modules/crawler/application/services/crawl-job-runner.service.ts';
import { ExportPipelineService } from '../../apps/api-legacy/src/modules/export/application/services/export-pipeline.service.ts';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('HTTP client refuses automatic redirects and caps response memory', () => {
  const config = buildAxiosRequestConfig();
  assert.equal(config.maxRedirects, 0);
  assert.equal(typeof config.maxContentLength, 'number');
  assert.ok(Number(config.maxContentLength) > 0);
  assert.equal(config.maxBodyLength, config.maxContentLength);
  assert.equal(config.validateStatus?.(302), false);
});

test('retry delay grows exponentially and can be aborted', async () => {
  assert.equal(
    computeRetryDelayMs(1, 100, 1000, () => 0),
    100
  );
  assert.equal(
    computeRetryDelayMs(2, 100, 1000, () => 0),
    200
  );
  assert.equal(
    computeRetryDelayMs(5, 100, 1000, () => 0),
    1000
  );
  const controller = new AbortController();
  const sleeping = abortableSleep(10_000, controller.signal);
  controller.abort();
  await assert.rejects(sleeping, (error: Error) => error.name === 'AbortError');
});

test('reader observes every prefetch promise', () => {
  const source = read('apps/web-legacy/src/modules/reader/presentation/use-infinite-reader.ts');
  assert.match(source, /function prefetchChapter/);
  assert.match(source, /source\.load\(novelId, chapter, signal\)\.catch\(\(\) => undefined\)/);
  assert.doesNotMatch(source, /if \(next\) void source\.load/);
  assert.doesNotMatch(source, /if \(following\) void source\.load/);
});

test('export rejects a source larger than the configured memory budget', async () => {
  const pipeline = new ExportPipelineService(
    {
      load: async () => ({
        novel: {
          id: 'n',
          title: 'N',
          sourceUrl: 'https://example.test/n',
          sourceName: 'x',
          status: 'completed',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        chapters: [
          {
            id: 'c',
            novelId: 'n',
            index: 1,
            title: 'C',
            sourceUrl: 'https://example.test/c',
            cleanText: '1234567890',
            status: 'fetched'
          }
        ]
      })
    },
    {
      txt: {
        write: async () => {
          throw new Error('writer should not run');
        }
      },
      epub: {
        write: async () => {
          throw new Error('writer should not run');
        }
      }
    },
    5
  );
  await assert.rejects(
    () => pipeline.execute('n', { format: 'txt', downloadedOnly: true }),
    /Export is too large/
  );
});

test('pause persists pausing before aborting and waits for runner completion', () => {
  const source = read(
    'apps/api-legacy/src/modules/crawler/application/services/crawl-queue.service.ts'
  );
  const update = source.indexOf('await this.tasks.update(this.tasks.markPausing');
  const abort = source.indexOf('this.controllers.get(taskId)?.abort()', update);
  const awaitProcess = source.indexOf('if (activeProcess) await activeProcess', abort);
  assert.ok(update >= 0 && abort > update && awaitProcess > abort);
  assert.match(source, /if \(latest\.status === 'pausing'\)/);
});
