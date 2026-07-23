#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FILES = {
  "tests/e2e/runtime.fixture.ts": "import type { Page, Route } from '@playwright/test';\n\nexport interface E2eRuntimeOptions {\n  mockNovels?: boolean;\n}\n\nconst envelope = (data: unknown) => JSON.stringify({ data, error: null });\n\nasync function fulfillJson(route: Route, data: unknown): Promise<void> {\n  await route.fulfill({\n    status: 200,\n    contentType: 'application/json',\n    body: envelope(data)\n  });\n}\n\nexport async function installE2eRuntime(\n  page: Page,\n  { mockNovels = true }: E2eRuntimeOptions = {}\n): Promise<void> {\n  await page.route('**/api/runtime', (route) =>\n    fulfillJson(route, { formatVersion: 1, instanceId: 'e2e' })\n  );\n  await page.route('**/api/events', (route) => route.fulfill({ status: 204, body: '' }));\n  await page.route('**/api/tasks/summary', (route) =>\n    fulfillJson(route, { activeCount: 0, queuedCount: 0, failedCount: 0 })\n  );\n  if (mockNovels) {\n    await page.route(/\\/api\\/novels(?:\\?.*)?$/, (route) =>\n      fulfillJson(route, { items: [], total: 0, limit: 12, offset: 0 })\n    );\n  }\n  await page.addInitScript(() => {\n    localStorage.setItem('novel-tool-runtime-instance', 'e2e');\n  });\n}\n",
  "tests/e2e/button-loading-feedback.spec.ts": "import { expect, test, type Page, type Route } from '@playwright/test';\nimport { installE2eRuntime } from './runtime.fixture';\n\nconst plugin = {\n  id: 'novelcool',\n  name: 'NovelCool',\n  activeVersion: '1.0.0',\n  trustLevel: 'built-in',\n  status: 'active',\n  enabled: true,\n  capabilities: ['metadata', 'chapter-list', 'chapter-content'],\n  domains: ['novelcool.com'],\n  permissionsPending: false,\n  health: { status: 'healthy' }\n};\n\nconst success = (data: unknown) => JSON.stringify({ data, error: null });\n\nasync function fulfillJson(route: Route, data: unknown, status = 200): Promise<void> {\n  await route.fulfill({\n    status,\n    contentType: 'application/json',\n    body: success(data)\n  });\n}\n\nasync function installButtonFeedbackApi(\n  page: Page,\n  options: { failDisable?: boolean } = {}\n): Promise<void> {\n  await page.route('**/api/source-reader/**', async (route) => {\n    const request = route.request();\n    const pathname = new URL(request.url()).pathname;\n\n    if (pathname === '/api/source-reader/plugins' && request.method() === 'GET') {\n      await fulfillJson(route, [plugin]);\n      return;\n    }\n\n    if (\n      pathname === '/api/source-reader/plugins/novelcool/disable' &&\n      request.method() === 'POST'\n    ) {\n      if (options.failDisable) {\n        await route.fulfill({\n          status: 500,\n          contentType: 'application/json',\n          body: JSON.stringify({\n            data: null,\n            error: { code: 'INTERNAL_ERROR', message: 'Toggle failed', details: null }\n          })\n        });\n        return;\n      }\n      await route.fulfill({ status: 204, body: '' });\n      return;\n    }\n\n    await fulfillJson(route, []);\n  });\n}\n\ntest('source switch shows stable in-place loading feedback even for a fast request', async ({\n  page\n}) => {\n  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));\n  await installButtonFeedbackApi(page);\n  await installE2eRuntime(page);\n  await page.goto('/sources');\n\n  const toggle = page.getByRole('switch', { name: 'Enable NovelCool', exact: true });\n  await expect(toggle).toBeChecked();\n  const before = await toggle.boundingBox();\n\n  await toggle.click();\n  await expect(toggle).toHaveAttribute('data-feedback-phase', 'loading');\n  const during = await toggle.boundingBox();\n\n  expect(before).not.toBeNull();\n  expect(during).not.toBeNull();\n  expect(Math.abs(during!.width - before!.width)).toBeLessThan(1);\n  expect(Math.abs(during!.height - before!.height)).toBeLessThan(1);\n\n  await expect(toggle).toHaveAttribute('data-feedback-phase', 'success', { timeout: 1200 });\n});\n\ntest('source switch reports an error phase instead of a success check on failure', async ({\n  page\n}) => {\n  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));\n  await installButtonFeedbackApi(page, { failDisable: true });\n  await installE2eRuntime(page);\n  await page.goto('/sources');\n\n  const toggle = page.getByRole('switch', { name: 'Enable NovelCool', exact: true });\n  await expect(toggle).toBeChecked();\n  await toggle.click();\n\n  await expect(toggle).toHaveAttribute('data-feedback-phase', 'loading');\n  await expect(toggle).toHaveAttribute('data-feedback-phase', 'error', { timeout: 1400 });\n  await expect(toggle).not.toHaveAttribute('data-feedback-phase', 'success');\n});\n",
  "tests/e2e/library-loading-stability.spec.ts": "import { expect, test } from '@playwright/test';\nimport { installE2eRuntime } from './runtime.fixture';\n\nconst staleHistory = [\n  {\n    schemaVersion: 1,\n    novelId: 'missing-novel',\n    chapterId: 'missing-chapter',\n    chapterIndex: 12,\n    paragraphId: 'p-1',\n    paragraphOffset: 0,\n    scrollRatio: 0.4,\n    updatedAt: '2026-07-19T00:00:00.000Z',\n    lastOpenedAt: '2026-07-19T00:00:00.000Z'\n  }\n];\n\ntest('stale continue-reading history does not shift the library search controls', async ({\n  page\n}) => {\n  await page.addInitScript((history) => {\n    localStorage.setItem('novel-tool-language', 'en');\n    localStorage.setItem('novel-tool-reader-history', JSON.stringify(history));\n  }, staleHistory);\n\n  await page.route('**/api/novels**', async (route) => {\n    const url = new URL(route.request().url());\n\n    if (url.pathname === '/api/novels') {\n      await new Promise((resolve) => setTimeout(resolve, 700));\n      await route.fulfill({\n        status: 200,\n        contentType: 'application/json',\n        body: JSON.stringify({\n          data: { items: [], total: 0, limit: 12, offset: 0 },\n          error: null\n        })\n      });\n      return;\n    }\n\n    await new Promise((resolve) => setTimeout(resolve, 300));\n    await route.fulfill({\n      status: 404,\n      contentType: 'application/json',\n      body: JSON.stringify({\n        data: null,\n        error: { code: 'NOT_FOUND', message: 'Novel not found', details: null }\n      })\n    });\n  });\n\n  await installE2eRuntime(page, { mockNovels: false });\n\n  const novelsResponse = page.waitForResponse(\n    (response) => new URL(response.url()).pathname === '/api/novels'\n  );\n  await page.goto('/library');\n\n  const search = page.getByRole('searchbox').first();\n  await expect(search).toBeVisible();\n  const before = await search.boundingBox();\n\n  await novelsResponse;\n  await expect(page.getByText('Your library is empty', { exact: true })).toBeVisible();\n  const after = await search.boundingBox();\n\n  expect(before).not.toBeNull();\n  expect(after).not.toBeNull();\n  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);\n});\n",
  "tests/e2e/web-reader-parity.spec.ts": "import { expect, test, type Page } from '@playwright/test';\nimport { installE2eRuntime } from './runtime.fixture';\n\nasync function installReaderMocks(page: Page, chapterCount = 20) {\n  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));\n  const chapters = Array.from({ length: chapterCount }, (_, index) => ({\n    id: `chapter-${index}`,\n    novelId: 'novel-1',\n    index,\n    title: `Chapter ${index}`,\n    sourceUrl: `https://example.test/chapter-${index}`,\n    status: 'fetched',\n    contentVersion: 1\n  }));\n  await page.route('**/api/novels/novel-1', (route) =>\n    route.fulfill({\n      contentType: 'application/json',\n      body: JSON.stringify({\n        data: {\n          novel: {\n            id: 'novel-1',\n            title: 'Reader parity novel',\n            sourceUrl: 'https://example.test/novel',\n            sourceName: 'Example',\n            status: 'completed',\n            createdAt: '2026-01-01T00:00:00.000Z',\n            updatedAt: '2026-01-02T00:00:00.000Z'\n          },\n          chapters\n        },\n        error: null\n      })\n    })\n  );\n  await page.route('**/api/novels/novel-1/chapters/*', async (route) => {\n    const index = Number(new URL(route.request().url()).pathname.split('/').at(-1) ?? 0);\n    const cleanText = Array.from(\n      { length: 40 },\n      (_, paragraph) =>\n        `Paragraph ${paragraph + 1} for chapter ${index} keeps the reader scrollable.`\n    ).join('\\n\\n');\n    await route.fulfill({\n      contentType: 'application/json',\n      body: JSON.stringify({\n        data: {\n          ...chapters[index],\n          rawText: `Raw chapter ${index}`,\n          cleanText\n        },\n        error: null\n      })\n    });\n  });\n  await page.route('**/api/novels/novel-1/task', (route) =>\n    route.fulfill({\n      contentType: 'application/json',\n      body: JSON.stringify({ data: null, error: null })\n    })\n  );\n  await installE2eRuntime(page);\n}\n\ntest('reader keeps a bounded five-chapter render window', async ({ page }) => {\n  await installReaderMocks(page);\n  await page.goto('/library/novel-1/read/10');\n  const renderedChapters = page.locator('#reader-content section[data-reader-chapter]');\n  await expect.poll(() => renderedChapters.count()).toBeGreaterThan(0);\n  expect(await renderedChapters.count()).toBeLessThanOrEqual(5);\n\n  const scrollRoot = page.locator('#reader-scroll-root');\n  await scrollRoot.evaluate((element) => {\n    const samples: Array<{ path: string; top: number }> = [];\n    (\n      window as Window & { __readerScrollSamples?: Array<{ path: string; top: number }> }\n    ).__readerScrollSamples = samples;\n    element.addEventListener(\n      'scroll',\n      () => samples.push({ path: location.pathname, top: element.scrollTop }),\n      { passive: true }\n    );\n  });\n  const initialPath = new URL(page.url()).pathname;\n  await expect\n    .poll(\n      async () => {\n        if (new URL(page.url()).pathname === initialPath) {\n          await scrollRoot.evaluate((element) => {\n            element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });\n          });\n        }\n        return new URL(page.url()).pathname;\n      },\n      { timeout: 10_000 }\n    )\n    .not.toBe(initialPath);\n  await page.waitForTimeout(100);\n  const samples = await page.evaluate(\n    () =>\n      (\n        window as Window & {\n          __readerScrollSamples?: Array<{ path: string; top: number }>;\n        }\n      ).__readerScrollSamples ?? []\n  );\n  const syncedSamples = samples.filter((sample) => sample.path !== initialPath);\n  expect(await scrollRoot.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);\n  expect(syncedSamples.every((sample) => sample.top > 0)).toBe(true);\n\n  await expect.poll(() => renderedChapters.count()).toBeGreaterThan(0);\n  expect(await renderedChapters.count()).toBeLessThanOrEqual(5);\n});\n\ntest('novel detail exposes reading management and chapter navigation landmarks', async ({\n  page\n}) => {\n  await installReaderMocks(page, 4);\n  await page.goto('/library/novel-1');\n  await expect(page.getByRole('heading', { name: 'Reader parity novel' })).toBeVisible();\n  await expect(page.getByRole('button', { name: 'Start reading', exact: true })).toBeVisible();\n  await expect(page.locator('#novel-detail-chapter-0')).toBeVisible();\n});\n",
  "tests/regression/e2e-route-isolation.test.ts": "import assert from 'node:assert/strict';\nimport { readFile } from 'node:fs/promises';\nimport test from 'node:test';\n\nconst RUNTIME_FIXTURE = new URL('../e2e/runtime.fixture.ts', import.meta.url);\nconst BUTTON_FEEDBACK_SPEC = new URL('../e2e/button-loading-feedback.spec.ts', import.meta.url);\nconst LIBRARY_STABILITY_SPEC = new URL('../e2e/library-loading-stability.spec.ts', import.meta.url);\nconst WEB_READER_SPEC = new URL('../e2e/web-reader-parity.spec.ts', import.meta.url);\n\ntest('shared E2E runtime fixture owns stable background API mocks', async () => {\n  const source = await readFile(RUNTIME_FIXTURE, 'utf8');\n\n  assert.match(source, /interface\\s+E2eRuntimeOptions/);\n  assert.match(source, /mockNovels\\?:\\s*boolean/);\n  assert.match(source, /page\\.route\\(['\"]\\*\\*\\/api\\/events['\"]/);\n  assert.match(source, /page\\.route\\(['\"]\\*\\*\\/api\\/tasks\\/summary['\"]/);\n  assert.match(source, /api\\\\\\/novels/);\n  assert.match(source, /status:\\s*204/);\n  assert.match(source, /activeCount:\\s*0/);\n  assert.match(source, /items:\\s*\\[\\]/);\n});\n\ntest('feature E2E specs do not duplicate shared background routes', async () => {\n  const [button, webReader] = await Promise.all([\n    readFile(BUTTON_FEEDBACK_SPEC, 'utf8'),\n    readFile(WEB_READER_SPEC, 'utf8')\n  ]);\n\n  for (const source of [button, webReader]) {\n    assert.doesNotMatch(source, /page\\.route\\(['\"]\\*\\*\\/api\\/events['\"]/);\n    assert.doesNotMatch(source, /page\\.route\\(['\"]\\*\\*\\/api\\/tasks\\/summary['\"]/);\n  }\n  assert.doesNotMatch(button, /page\\.route\\(['\"]\\*\\*\\/api\\/\\*\\*['\"]/);\n  assert.match(button, /page\\.route\\(['\"]\\*\\*\\/api\\/source-reader\\/\\*\\*['\"]/);\n});\n\ntest('library loading stability keeps ownership of its delayed novels response', async () => {\n  const source = await readFile(LIBRARY_STABILITY_SPEC, 'utf8');\n  assert.match(source, /installE2eRuntime\\(page,\\s*\\{\\s*mockNovels:\\s*false\\s*\\}\\)/);\n});\n"
};
const BASELINES = {
  "tests/e2e/runtime.fixture.ts": "import type { Page } from '@playwright/test';\n\nexport async function installE2eRuntime(page: Page): Promise<void> {\n  await page.route('**/api/runtime', (route) =>\n    route.fulfill({\n      status: 200,\n      contentType: 'application/json',\n      body: JSON.stringify({\n        data: { formatVersion: 1, instanceId: 'e2e' },\n        error: null\n      })\n    })\n  );\n  await page.addInitScript(() => {\n    localStorage.setItem('novel-tool-runtime-instance', 'e2e');\n  });\n}\n",
  "tests/e2e/button-loading-feedback.spec.ts": "import { expect, test, type Page, type Route } from '@playwright/test';\nimport { installE2eRuntime } from './runtime.fixture';\n\nconst plugin = {\n  id: 'novelcool',\n  name: 'NovelCool',\n  activeVersion: '1.0.0',\n  trustLevel: 'built-in',\n  status: 'active',\n  enabled: true,\n  capabilities: ['metadata', 'chapter-list', 'chapter-content'],\n  domains: ['novelcool.com'],\n  permissionsPending: false,\n  health: { status: 'healthy' }\n};\n\nconst success = (data: unknown) => JSON.stringify({ data, error: null });\n\nasync function fulfillJson(route: Route, data: unknown, status = 200): Promise<void> {\n  await route.fulfill({\n    status,\n    contentType: 'application/json',\n    body: success(data)\n  });\n}\n\nasync function installButtonFeedbackApi(\n  page: Page,\n  options: { failDisable?: boolean } = {}\n): Promise<void> {\n  await page.route('**/api/source-reader/**', async (route) => {\n    const request = route.request();\n    const pathname = new URL(request.url()).pathname;\n\n    if (pathname === '/api/source-reader/plugins' && request.method() === 'GET') {\n      await fulfillJson(route, [plugin]);\n      return;\n    }\n\n    if (\n      pathname === '/api/source-reader/plugins/novelcool/disable' &&\n      request.method() === 'POST'\n    ) {\n      if (options.failDisable) {\n        await route.fulfill({\n          status: 500,\n          contentType: 'application/json',\n          body: JSON.stringify({\n            data: null,\n            error: { code: 'INTERNAL_ERROR', message: 'Toggle failed', details: null }\n          })\n        });\n        return;\n      }\n      await route.fulfill({ status: 204, body: '' });\n      return;\n    }\n\n    await fulfillJson(route, []);\n  });\n\n  await page.route('**/api/tasks/summary', (route) =>\n    fulfillJson(route, { activeCount: 0, queuedCount: 0, failedCount: 0 })\n  );\n\n  // Do not let a catch-all JSON mock impersonate the realtime event stream.\n  await page.route('**/api/events', (route) => route.fulfill({ status: 204, body: '' }));\n}\n\ntest('source switch shows stable in-place loading feedback even for a fast request', async ({\n  page\n}) => {\n  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));\n  await installButtonFeedbackApi(page);\n  await installE2eRuntime(page);\n  await page.goto('/sources');\n\n  const toggle = page.getByRole('switch', { name: 'Enable NovelCool', exact: true });\n  await expect(toggle).toBeChecked();\n  const before = await toggle.boundingBox();\n\n  await toggle.click();\n  await expect(toggle).toHaveAttribute('data-feedback-phase', 'loading');\n  const during = await toggle.boundingBox();\n\n  expect(before).not.toBeNull();\n  expect(during).not.toBeNull();\n  expect(Math.abs(during!.width - before!.width)).toBeLessThan(1);\n  expect(Math.abs(during!.height - before!.height)).toBeLessThan(1);\n\n  await expect(toggle).toHaveAttribute('data-feedback-phase', 'success', { timeout: 1200 });\n});\n\ntest('source switch reports an error phase instead of a success check on failure', async ({\n  page\n}) => {\n  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));\n  await installButtonFeedbackApi(page, { failDisable: true });\n  await installE2eRuntime(page);\n  await page.goto('/sources');\n\n  const toggle = page.getByRole('switch', { name: 'Enable NovelCool', exact: true });\n  await expect(toggle).toBeChecked();\n  await toggle.click();\n\n  await expect(toggle).toHaveAttribute('data-feedback-phase', 'loading');\n  await expect(toggle).toHaveAttribute('data-feedback-phase', 'error', { timeout: 1400 });\n  await expect(toggle).not.toHaveAttribute('data-feedback-phase', 'success');\n});\n",
  "tests/e2e/library-loading-stability.spec.ts": "import { expect, test } from '@playwright/test';\nimport { installE2eRuntime } from './runtime.fixture';\n\nconst staleHistory = [\n  {\n    schemaVersion: 1,\n    novelId: 'missing-novel',\n    chapterId: 'missing-chapter',\n    chapterIndex: 12,\n    paragraphId: 'p-1',\n    paragraphOffset: 0,\n    scrollRatio: 0.4,\n    updatedAt: '2026-07-19T00:00:00.000Z',\n    lastOpenedAt: '2026-07-19T00:00:00.000Z'\n  }\n];\n\ntest('stale continue-reading history does not shift the library search controls', async ({\n  page\n}) => {\n  await page.addInitScript((history) => {\n    localStorage.setItem('novel-tool-language', 'en');\n    localStorage.setItem('novel-tool-reader-history', JSON.stringify(history));\n  }, staleHistory);\n\n  await page.route('**/api/novels**', async (route) => {\n    const url = new URL(route.request().url());\n\n    if (url.pathname === '/api/novels') {\n      await new Promise((resolve) => setTimeout(resolve, 700));\n      await route.fulfill({\n        status: 200,\n        contentType: 'application/json',\n        body: JSON.stringify({\n          data: { items: [], total: 0, limit: 12, offset: 0 },\n          error: null\n        })\n      });\n      return;\n    }\n\n    await new Promise((resolve) => setTimeout(resolve, 300));\n    await route.fulfill({\n      status: 404,\n      contentType: 'application/json',\n      body: JSON.stringify({\n        data: null,\n        error: { code: 'NOT_FOUND', message: 'Novel not found', details: null }\n      })\n    });\n  });\n\n  await installE2eRuntime(page);\n\n  const novelsResponse = page.waitForResponse(\n    (response) => new URL(response.url()).pathname === '/api/novels'\n  );\n  await page.goto('/library');\n\n  const search = page.getByRole('searchbox').first();\n  await expect(search).toBeVisible();\n  const before = await search.boundingBox();\n\n  await novelsResponse;\n  await expect(page.getByText('Your library is empty', { exact: true })).toBeVisible();\n  const after = await search.boundingBox();\n\n  expect(before).not.toBeNull();\n  expect(after).not.toBeNull();\n  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);\n});\n",
  "tests/e2e/web-reader-parity.spec.ts": "import { expect, test, type Page } from '@playwright/test';\nimport { installE2eRuntime } from './runtime.fixture';\n\nasync function installReaderMocks(page: Page, chapterCount = 20) {\n  await page.addInitScript(() => localStorage.setItem('novel-tool-language', 'en'));\n  const chapters = Array.from({ length: chapterCount }, (_, index) => ({\n    id: `chapter-${index}`,\n    novelId: 'novel-1',\n    index,\n    title: `Chapter ${index}`,\n    sourceUrl: `https://example.test/chapter-${index}`,\n    status: 'fetched',\n    contentVersion: 1\n  }));\n  await page.route('**/api/novels/novel-1', (route) =>\n    route.fulfill({\n      contentType: 'application/json',\n      body: JSON.stringify({\n        data: {\n          novel: {\n            id: 'novel-1',\n            title: 'Reader parity novel',\n            sourceUrl: 'https://example.test/novel',\n            sourceName: 'Example',\n            status: 'completed',\n            createdAt: '2026-01-01T00:00:00.000Z',\n            updatedAt: '2026-01-02T00:00:00.000Z'\n          },\n          chapters\n        },\n        error: null\n      })\n    })\n  );\n  await page.route('**/api/novels/novel-1/chapters/*', async (route) => {\n    const index = Number(new URL(route.request().url()).pathname.split('/').at(-1) ?? 0);\n    const cleanText = Array.from(\n      { length: 40 },\n      (_, paragraph) =>\n        `Paragraph ${paragraph + 1} for chapter ${index} keeps the reader scrollable.`\n    ).join('\\n\\n');\n    await route.fulfill({\n      contentType: 'application/json',\n      body: JSON.stringify({\n        data: {\n          ...chapters[index],\n          rawText: `Raw chapter ${index}`,\n          cleanText\n        },\n        error: null\n      })\n    });\n  });\n  await page.route('**/api/novels/novel-1/task', (route) =>\n    route.fulfill({\n      contentType: 'application/json',\n      body: JSON.stringify({ data: null, error: null })\n    })\n  );\n  await page.route('**/api/events', (route) => route.abort());\n  await installE2eRuntime(page);\n}\n\ntest('reader keeps a bounded five-chapter render window', async ({ page }) => {\n  await installReaderMocks(page);\n  await page.goto('/library/novel-1/read/10');\n  const renderedChapters = page.locator('#reader-content section[data-reader-chapter]');\n  await expect.poll(() => renderedChapters.count()).toBeGreaterThan(0);\n  expect(await renderedChapters.count()).toBeLessThanOrEqual(5);\n\n  const scrollRoot = page.locator('#reader-scroll-root');\n  await scrollRoot.evaluate((element) => {\n    const samples: Array<{ path: string; top: number }> = [];\n    (\n      window as Window & { __readerScrollSamples?: Array<{ path: string; top: number }> }\n    ).__readerScrollSamples = samples;\n    element.addEventListener(\n      'scroll',\n      () => samples.push({ path: location.pathname, top: element.scrollTop }),\n      { passive: true }\n    );\n  });\n  const initialPath = new URL(page.url()).pathname;\n  await expect\n    .poll(\n      async () => {\n        if (new URL(page.url()).pathname === initialPath) {\n          await scrollRoot.evaluate((element) => {\n            element.scrollTo({ top: element.scrollHeight, behavior: 'auto' });\n          });\n        }\n        return new URL(page.url()).pathname;\n      },\n      { timeout: 10_000 }\n    )\n    .not.toBe(initialPath);\n  await page.waitForTimeout(100);\n  const samples = await page.evaluate(\n    () =>\n      (\n        window as Window & {\n          __readerScrollSamples?: Array<{ path: string; top: number }>;\n        }\n      ).__readerScrollSamples ?? []\n  );\n  const syncedSamples = samples.filter((sample) => sample.path !== initialPath);\n  expect(await scrollRoot.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);\n  expect(syncedSamples.every((sample) => sample.top > 0)).toBe(true);\n\n  await expect.poll(() => renderedChapters.count()).toBeGreaterThan(0);\n  expect(await renderedChapters.count()).toBeLessThanOrEqual(5);\n});\n\ntest('novel detail exposes reading management and chapter navigation landmarks', async ({\n  page\n}) => {\n  await installReaderMocks(page, 4);\n  await page.goto('/library/novel-1');\n  await expect(page.getByRole('heading', { name: 'Reader parity novel' })).toBeVisible();\n  await expect(page.getByRole('button', { name: 'Start reading', exact: true })).toBeVisible();\n  await expect(page.locator('#novel-detail-chapter-0')).toBeVisible();\n});\n",
  "tests/regression/e2e-route-isolation.test.ts": "import assert from 'node:assert/strict';\nimport { readFile } from 'node:fs/promises';\nimport test from 'node:test';\n\nconst BUTTON_FEEDBACK_SPEC = new URL('../e2e/button-loading-feedback.spec.ts', import.meta.url);\n\ntest('button feedback E2E isolates source APIs without impersonating the realtime stream', async () => {\n  const source = await readFile(BUTTON_FEEDBACK_SPEC, 'utf8');\n  assert.doesNotMatch(source, /page\\.route\\(['\"]\\*\\*\\/api\\/\\*\\*['\"]/);\n  assert.match(source, /page\\.route\\(['\"]\\*\\*\\/api\\/source-reader\\/\\*\\*['\"]/);\n  assert.match(source, /page\\.route\\(['\"]\\*\\*\\/api\\/events['\"]/);\n  assert.match(source, /status:\\s*204/);\n});\n"
};
const FORBIDDEN_E2E_OUTPUT = [/http proxy error:/i, /ECONNREFUSED\s+127\.0\.0\.1:3000/i];

function normalize(value) {
  return value.replace(/\r\n/g, '\n');
}

function parseArguments(argv) {
  const options = { root: '.', force: false, skipVerify: false, skipE2e: false };
  for (const argument of argv) {
    if (argument === '--force') options.force = true;
    else if (argument === '--skip-verify') options.skipVerify = true;
    else if (argument === '--skip-e2e') options.skipE2e = true;
    else if (argument === '--help') options.help = true;
    else if (argument.startsWith('--')) throw new Error(`Unknown option: ${argument}`);
    else if (options.root === '.') options.root = argument;
    else throw new Error(`Unexpected argument: ${argument}`);
  }
  return options;
}

function help() {
  return [
    'Usage: node apply_e2e_background_api_cleanup.mjs [project-root] [options]',
    '',
    'Options:',
    '  --skip-e2e    Apply and run static/type checks without launching Chromium',
    '  --skip-verify Apply source only',
    '  --force       Overwrite files that differ from the known checkpoint',
    '  --help        Show this help'
  ].join('\n');
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function applyFiles(root, force) {
  let changed = 0;
  for (const [relativePath, desired] of Object.entries(FILES)) {
    const absolutePath = resolve(root, relativePath);
    const current = await readOptional(absolutePath);
    const normalizedCurrent = current === null ? null : normalize(current);
    const normalizedDesired = normalize(desired);
    const normalizedBaseline = normalize(BASELINES[relativePath]);
    if (
      !force &&
      normalizedCurrent !== null &&
      normalizedCurrent !== normalizedDesired &&
      normalizedCurrent !== normalizedBaseline
    ) {
      throw new Error(
        `${relativePath} differs from the known E2E checkpoint. Review it or rerun with --force.`
      );
    }
    if (normalizedCurrent === normalizedDesired) continue;
    await writeFile(absolutePath, desired, 'utf8');
    changed += 1;
  }
  console.log(`[patch] changed ${changed} file(s)`);
}

function run(command, args, { cwd, stage, capture = false } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    console.log(`[patch] ${stage}`);
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
    });
    const chunks = [];
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        chunks.push(chunk);
        process.stdout.write(chunk);
      });
      child.stderr.on('data', (chunk) => {
        chunks.push(chunk);
        process.stderr.write(chunk);
      });
    }
    child.once('error', rejectRun);
    child.once('close', (code, signal) => {
      if (code !== 0) {
        rejectRun(
          new Error(
            `${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `code ${code}`}`
          )
        );
        return;
      }
      resolveRun(chunks.join(''));
    });
  });
}

async function verify(root, skipE2e) {
  await run(
    process.execPath,
    ['--import', 'tsx', '--test', 'tests/regression/e2e-route-isolation.test.ts'],
    { cwd: root, stage: 'focused regression' }
  );
  await run(process.execPath, ['scripts/cli.mjs', 'check', '--group', 'format'], {
    cwd: root,
    stage: 'format check'
  });
  await run(process.execPath, ['scripts/cli.mjs', 'check', '--group', 'types'], {
    cwd: root,
    stage: 'type check'
  });
  if (skipE2e) return;
  const output = await run(process.execPath, ['scripts/cli.mjs', 'test', '--suite', 'e2e'], {
    cwd: root,
    stage: 'clean browser E2E',
    capture: true
  });
  const violation = FORBIDDEN_E2E_OUTPUT.find((pattern) => pattern.test(output));
  if (violation) {
    throw new Error(`Browser E2E passed but emitted forbidden proxy output: ${violation}`);
  }
  console.log('[patch] browser E2E output contains no Vite proxy connection errors');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(help());
    return;
  }
  const root = resolve(options.root);
  await applyFiles(root, options.force);
  if (!options.skipVerify) await verify(root, options.skipE2e);
  console.log('[patch] E2E background API cleanup complete.');
}

main().catch((error) => {
  console.error(`[patch] ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
