import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createNovelCoolPlugin } from '../src/index.ts';
import { canonicalChapterContentUrl } from '../src/novelcool-url.ts';
import { createExternalContextFixture } from './helpers/external-context.fixture.ts';

const slashUrl = 'https://novelcool.com/chapter/Chapter-931-Not-a-Lonely-Birthday/14115083/';
const htmlUrl = 'https://novelcool.com/chapter/Chapter-931-Not-a-Lonely-Birthday/14115083.html';
const validHtml = await readFile(new URL('./fixtures/chapter-valid.html', import.meta.url), 'utf8');
const invalidHtml = await readFile(
  new URL('./fixtures/chapter-invalid.html', import.meta.url),
  'utf8'
);
const challengeHtml = await readFile(new URL('./fixtures/challenge.html', import.meta.url), 'utf8');

const allowedDiagnosticKeys = [
  'attempt',
  'requestedUrl',
  'finalUrl',
  'pageClassification',
  'title',
  'selectorCounts',
  'rawChars',
  'cleanChars'
].sort();

function hasCode(expected: string) {
  return (error: unknown) =>
    error instanceof Error && (error as Error & { code?: string }).code === expected;
}

test('canonical fallback changes only a slash numeric chapter URL', () => {
  assert.equal(canonicalChapterContentUrl(slashUrl), htmlUrl);
  assert.equal(canonicalChapterContentUrl(htmlUrl), undefined);
  assert.equal(
    canonicalChapterContentUrl('https://example.com/chapter/Chapter-931/14115083/'),
    undefined
  );
  assert.equal(canonicalChapterContentUrl('https://novelcool.com/novel/book/14115083/'), undefined);
});

test('extracts and sanitizes valid chapter content', async () => {
  const fixture = createExternalContextFixture({ responses: { [htmlUrl]: { data: validHtml } } });
  const result = await createNovelCoolPlugin().readChapterContent!(
    { url: htmlUrl },
    fixture.context
  );

  assert.equal(result.data.title, 'Chapter 931: Not a Lonely Birthday');
  assert.match(result.data.rawText, /fixture chapter body/i);
  assert.match(result.data.cleanText, /fixture chapter body/i);
  assert.doesNotMatch(result.data.cleanText, /support us on patreon/i);
  assert.equal(result.data.url, htmlUrl);
  assert.deepEqual(fixture.requests, [htmlUrl]);
});

test('configured minimum chapter length rejects shorter content', async () => {
  const fixture = createExternalContextFixture({ responses: { [htmlUrl]: { data: validHtml } } });

  await assert.rejects(async () => {
    await createNovelCoolPlugin({ minimumChapterContentChars: 10_000 }).readChapterContent!(
      { url: htmlUrl },
      fixture.context
    );
  }, hasCode('PLUGIN_RESULT_INVALID'));
  assert.deepEqual(fixture.requests, [htmlUrl]);
});

test('retries a slash numeric URL once as canonical .html', async () => {
  const fixture = createExternalContextFixture({
    responses: {
      [slashUrl]: { data: invalidHtml },
      [htmlUrl]: { data: validHtml }
    }
  });
  const result = await createNovelCoolPlugin().readChapterContent!(
    { url: slashUrl },
    fixture.context
  );

  assert.match(result.data.cleanText, /fixture chapter body/i);
  assert.deepEqual(fixture.requests, [slashUrl, htmlUrl]);
});

test('does not retry more than once and preserves both failed attempts in bounded logs', async () => {
  const fixture = createExternalContextFixture({
    responses: {
      [slashUrl]: { data: invalidHtml },
      [htmlUrl]: { data: invalidHtml }
    }
  });

  await assert.rejects(
    async () => {
      await createNovelCoolPlugin().readChapterContent!({ url: slashUrl }, fixture.context);
    },
    (error: unknown) =>
      hasCode('PLUGIN_RESULT_INVALID')(error) &&
      error instanceof Error &&
      /initial and canonical fallback/i.test(error.message)
  );
  assert.deepEqual(fixture.requests, [slashUrl, htmlUrl]);
  assert.equal(
    fixture.logs.filter((entry) => entry.message === 'novelcool.chapter_content_invalid').length,
    2
  );
  for (const entry of fixture.logs) {
    assert.deepEqual(Object.keys(entry.metadata ?? {}).sort(), allowedDiagnosticKeys);
    assert.doesNotMatch(JSON.stringify(entry.metadata), /fixture secret body/i);
  }
});

test('bounded diagnostics redact sensitive URL query values', async () => {
  const secretSlashUrl = `${slashUrl}?token=super-secret-value`;
  const secretHtmlUrl = `${htmlUrl}?token=super-secret-value`;
  const fixture = createExternalContextFixture({
    responses: {
      [secretSlashUrl]: { data: invalidHtml },
      [secretHtmlUrl]: { data: invalidHtml }
    }
  });

  await assert.rejects(async () => {
    await createNovelCoolPlugin().readChapterContent!({ url: secretSlashUrl }, fixture.context);
  }, hasCode('PLUGIN_RESULT_INVALID'));
  assert.doesNotMatch(JSON.stringify(fixture.logs), /super-secret-value/);
});

test('challenge pages fail without a fallback request', async () => {
  const fixture = createExternalContextFixture({
    responses: { [slashUrl]: { data: challengeHtml } }
  });

  await assert.rejects(async () => {
    await createNovelCoolPlugin().readChapterContent!({ url: slashUrl }, fixture.context);
  }, hasCode('UPSTREAM_CHALLENGE_DETECTED'));
  assert.deepEqual(fixture.requests, [slashUrl]);
});

test('a challenge on the canonical fallback keeps bounded diagnostics for both attempts', async () => {
  const fixture = createExternalContextFixture({
    responses: {
      [slashUrl]: { data: invalidHtml },
      [htmlUrl]: { data: challengeHtml }
    }
  });

  await assert.rejects(async () => {
    await createNovelCoolPlugin().readChapterContent!({ url: slashUrl }, fixture.context);
  }, hasCode('UPSTREAM_CHALLENGE_DETECTED'));
  assert.deepEqual(fixture.requests, [slashUrl, htmlUrl]);
  assert.equal(
    fixture.logs.filter((entry) => entry.message === 'novelcool.chapter_content_invalid').length,
    2
  );
});

test('rate-limited responses fail without attempting a content alias', async () => {
  const fixture = createExternalContextFixture({
    responses: {
      [slashUrl]: { status: 429, data: '<html><title>Too many requests</title></html>' }
    }
  });

  await assert.rejects(async () => {
    await createNovelCoolPlugin().readChapterContent!({ url: slashUrl }, fixture.context);
  }, hasCode('SOURCE_RATE_LIMITED'));
  assert.deepEqual(fixture.requests, [slashUrl]);
});

test('unavailable chapter pages fail without attempting a content alias', async () => {
  const fixture = createExternalContextFixture({
    responses: {
      [slashUrl]: {
        data: '<html><head><title>Chapter not found</title></head><body><h1 class="chapter-title">Chapter not found</h1><p>Content is unavailable.</p></body></html>'
      }
    }
  });

  await assert.rejects(async () => {
    await createNovelCoolPlugin().readChapterContent!({ url: slashUrl }, fixture.context);
  }, hasCode('SOURCE_TEMPORARILY_UNAVAILABLE'));
  assert.deepEqual(fixture.requests, [slashUrl]);
});

test('cancellation prevents the fallback request', async () => {
  const fixture = createExternalContextFixture({
    responses: { [slashUrl]: { data: invalidHtml } }
  });
  fixture.afterRequest(() => fixture.abort());

  await assert.rejects(async () => {
    await createNovelCoolPlugin().readChapterContent!({ url: slashUrl }, fixture.context);
  }, hasCode('SOURCE_READER_CANCELLED'));
  assert.deepEqual(fixture.requests, [slashUrl]);
});
