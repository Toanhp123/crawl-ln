import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import plugin, { canHandleNovelCool, createNovelCoolPlugin } from '../src/index.ts';
import { createExternalContextFixture } from './helpers/external-context.fixture.ts';

const novelUrl = 'https://www.novelcool.com/novel/original/id-251898.html#top';
const normalizedNovelUrl = 'https://novelcool.com/novel/original/id-251898.html';
const chapterUrl = 'https://novelcool.com/chapter/Chapter-1/1001/';

function hasCode(expected: string) {
  return (error: unknown) =>
    error instanceof Error && (error as Error & { code?: string }).code === expected;
}

test('lifecycle and probe methods support isolated activation', async () => {
  const fixture = createExternalContextFixture({ normalizedUrl: normalizedNovelUrl });
  await plugin.initialize?.(
    {
      pluginId: 'novelcool',
      pluginVersion: '2.0.0',
      protocolVersion: 1,
      now: '2026-07-26T00:00:00.000Z'
    },
    fixture.context
  );

  assert.deepEqual(await plugin.healthCheck?.({}, fixture.context), { status: 'healthy' });
  assert.equal(
    await plugin.probeCanHandle?.(
      { normalizedUrl: normalizedNovelUrl, domain: 'novelcool.com', capability: 'metadata' },
      fixture.context
    ),
    true
  );
  assert.equal(
    await plugin.probeCanHandle?.(
      {
        normalizedUrl: 'https://example.com/novel/original/id-251898.html',
        domain: 'example.com',
        capability: 'metadata'
      },
      fixture.context
    ),
    false
  );
  assert.equal(canHandleNovelCool(normalizedNovelUrl, 'novelcool.com'), true);
  assert.equal(canHandleNovelCool('https://novelcool.com/account/profile', 'novelcool.com'), false);
  await plugin.shutdown?.({ reason: 'disable' }, fixture.context);
});

test('identify normalizes www and classifies novel and chapter URLs', async () => {
  const fixture = createExternalContextFixture({ normalizedUrl: normalizedNovelUrl });
  assert.deepEqual(await plugin.identify?.({ url: novelUrl }, fixture.context), {
    data: {
      normalizedUrl: normalizedNovelUrl,
      domain: 'novelcool.com',
      pageType: 'novel'
    }
  });
  assert.deepEqual(await plugin.identify?.({ url: chapterUrl }, fixture.context), {
    data: {
      normalizedUrl: chapterUrl,
      domain: 'novelcool.com',
      pageType: 'chapter'
    }
  });
});

test('metadata uses only the asynchronous SDK context surface', async () => {
  const html = await readFile(new URL('./fixtures/novel.html', import.meta.url), 'utf8');
  const fixture = createExternalContextFixture({
    responses: {
      [novelUrl]: {
        url: 'https://www.novelcool.com/novel/original/id-251898.html',
        data: html
      }
    }
  });

  const result = await createNovelCoolPlugin().readMetadata?.({ url: novelUrl }, fixture.context);
  assert.equal(result?.data.title, 'Fixture Novel');
  assert.equal(result?.data.author, 'Fixture Author');
  assert.equal(result?.data.description, 'Fixture description.');
  assert.equal(result?.data.sourceName, 'NovelCool');
  assert.equal(result?.data.sourceUrl, normalizedNovelUrl);
  assert.equal(result?.data.coverUrl, 'https://www.novelcool.com/images/fixture.jpg');
  assert.deepEqual(result?.cacheHints, {
    scope: 'public',
    ttlMs: 1_800_000,
    staleWhileRevalidateMs: 21_600_000
  });
  assert.deepEqual(fixture.requests, [novelUrl]);
});

test('metadata classifies challenge pages as a typed upstream failure', async () => {
  const fixture = createExternalContextFixture({
    responses: {
      [novelUrl]: {
        data: '<html><head><title>Just a moment...</title></head><body><form id="challenge-form"></form></body></html>'
      }
    }
  });

  await assert.rejects(async () => {
    await createNovelCoolPlugin().readMetadata!({ url: novelUrl }, fixture.context);
  }, hasCode('UPSTREAM_CHALLENGE_DETECTED'));
});

test('metadata rejects missing titles without exposing page content', async () => {
  const fixture = createExternalContextFixture({
    responses: { [novelUrl]: { data: '<html><head><title>Novel Cool</title></head></html>' } }
  });

  await assert.rejects(
    async () => {
      await createNovelCoolPlugin().readMetadata!({ url: novelUrl }, fixture.context);
    },
    (error: unknown) =>
      hasCode('PLUGIN_RESULT_INVALID')(error) &&
      error instanceof Error &&
      !error.message.includes('<html>')
  );
});

test('metadata honors cancellation before making an HTTP request', async () => {
  const fixture = createExternalContextFixture();
  fixture.abort();

  await assert.rejects(async () => {
    await createNovelCoolPlugin().readMetadata!({ url: novelUrl }, fixture.context);
  }, hasCode('SOURCE_READER_CANCELLED'));
  assert.deepEqual(fixture.requests, []);
});
