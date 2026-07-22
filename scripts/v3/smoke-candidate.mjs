import { randomBytes, randomUUID } from 'node:crypto';
import { access, cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from '@playwright/test';
import { writeCandidateManifestFromEvidence } from './candidate-manifest.mjs';
import { assertMigrationReport, validateMigrationReport } from './migration-report.mjs';
import { reserveLoopbackPort, startManagedProcess, waitForHttp } from './process-runner.mjs';
import { findStorageDatabase } from './storage-manifest.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const apiEntry = join(projectRoot, 'apps', 'api', 'dist', 'main.js');
const webRoot = join(projectRoot, 'apps', 'web');
const webEntry = join(webRoot, 'dist', 'index.html');
const vite = join(webRoot, 'node_modules', 'vite', 'bin', 'vite.js');

async function readEnvelope(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok || body?.error !== null) {
    throw new Error(`Candidate HTTP smoke failed for ${url}: HTTP ${response.status}`);
  }
  return body.data;
}

async function assertWebRoute(url) {
  const response = await fetch(url);
  const content = await response.text();
  if (!response.ok || !content.includes('id="root"')) {
    throw new Error(`Candidate web route smoke failed for ${url}: HTTP ${response.status}`);
  }
}

export function assertRedactedCandidateData(value, forbiddenValues) {
  const serialized = JSON.stringify(value);
  for (const forbidden of forbiddenValues.filter(Boolean)) {
    const escaped = JSON.stringify(forbidden).slice(1, -1);
    if (serialized.includes(forbidden) || serialized.includes(escaped)) {
      throw new Error('Source Reader admin smoke exposed sensitive data');
    }
  }
  if (/encrypted_|package_path|SOURCE_READER_MASTER_KEY/i.test(serialized)) {
    throw new Error('Source Reader admin smoke exposed internal storage data');
  }
}

export async function runCandidateHttpSmoke({
  apiBaseUrl,
  webBaseUrl,
  secretValues = [],
  storagePath = ''
}) {
  const health = await readEnvelope(`${apiBaseUrl}/health`);
  if (health?.ok !== true || health?.name !== 'novel-tool') {
    throw new Error('Candidate API health response is invalid');
  }
  const missing = await fetch(`${apiBaseUrl}/api/not-a-route`);
  const missingBody = await missing.json();
  if (missing.status !== 404 || missingBody?.error?.code !== 'NOT_FOUND') {
    throw new Error('Candidate API 404 contract is invalid');
  }

  const library = await readEnvelope(
    `${apiBaseUrl}/api/novels?limit=10&offset=0&status=all&sort=recent`
  );
  const novel = library?.items?.[0];
  if (!novel?.id) throw new Error('Candidate library smoke found no migrated novel');
  const detail = await readEnvelope(`${apiBaseUrl}/api/novels/${encodeURIComponent(novel.id)}`);
  const chapter = detail?.chapters?.[0];
  if (!chapter || !Number.isInteger(chapter.index)) {
    throw new Error('Candidate reader smoke found no migrated chapter');
  }
  const chapterContent = await readEnvelope(
    `${apiBaseUrl}/api/novels/${encodeURIComponent(novel.id)}/chapters/${chapter.index}`
  );
  if (
    chapterContent?.id !== chapter.id ||
    typeof (chapterContent.cleanText ?? chapterContent.rawText) !== 'string'
  ) {
    throw new Error('Candidate reader smoke returned invalid chapter content');
  }

  const actorHeaders = { 'x-source-reader-user-id': 'candidate-smoke' };
  for (const path of ['/plugins', '/credentials', '/network-profiles', '/auth/challenges']) {
    const data = await readEnvelope(`${apiBaseUrl}/api/source-reader${path}`, {
      headers: actorHeaders
    });
    assertRedactedCandidateData(data, [...secretValues, storagePath]);
  }

  for (const path of [
    '/',
    '/library',
    `/library/${encodeURIComponent(novel.id)}`,
    `/library/${encodeURIComponent(novel.id)}/read/${chapter.index}`,
    '/sources'
  ]) {
    await assertWebRoute(`${webBaseUrl}${path}`);
  }

  return {
    apiHealth: true,
    httpContracts: true,
    webRoutes: true,
    reader: true,
    sourceReaderAdmin: true
  };
}

export async function runCandidateBrowserSmoke({
  apiBaseUrl,
  webBaseUrl,
  timeoutMs = 15_000,
  executablePath
}) {
  const library = await readEnvelope(
    `${apiBaseUrl}/api/novels?limit=10&offset=0&status=all&sort=recent`
  );
  const novel = library?.items?.[0];
  if (!novel?.id || typeof novel.title !== 'string') {
    throw new Error('Candidate browser smoke found no migrated novel');
  }
  const detail = await readEnvelope(`${apiBaseUrl}/api/novels/${encodeURIComponent(novel.id)}`);
  const chapter = detail?.chapters?.[0];
  if (!chapter || !Number.isInteger(chapter.index)) {
    throw new Error('Candidate browser smoke found no migrated chapter');
  }
  const chapterContent = await readEnvelope(
    `${apiBaseUrl}/api/novels/${encodeURIComponent(novel.id)}/chapters/${chapter.index}`
  );
  const chapterText = String(chapterContent.cleanText ?? chapterContent.rawText ?? '')
    .trim()
    .slice(0, 80);
  if (!chapterText) throw new Error('Candidate browser smoke found empty chapter content');

  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {})
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.addInitScript((candidateApiBaseUrl) => {
      try {
        localStorage.setItem('novel-tool-language', 'en');
      } catch {
        // about:blank has no local storage; the script runs again for the app origin.
      }
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const request = input instanceof Request ? input : undefined;
        const url = new URL(request?.url ?? String(input), window.location.href);
        if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
        const target = new URL(`${url.pathname}${url.search}${url.hash}`, candidateApiBaseUrl);
        return request
          ? nativeFetch(new Request(target, request), init)
          : nativeFetch(target, init);
      };
      const NativeEventSource = window.EventSource;
      window.EventSource = class extends NativeEventSource {
        constructor(url, options) {
          const parsed = new URL(String(url), window.location.href);
          const target = parsed.pathname.startsWith('/api/')
            ? new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, candidateApiBaseUrl)
            : parsed;
          super(target, options);
        }
      };
    }, apiBaseUrl);

    const waitForText = (text) =>
      page.waitForFunction((expected) => document.body.textContent?.includes(expected), text, {
        timeout: timeoutMs
      });
    await page.goto(`${webBaseUrl}/library`, { waitUntil: 'domcontentloaded' });
    await waitForText(novel.title);
    await page.goto(`${webBaseUrl}/library/${encodeURIComponent(novel.id)}/read/${chapter.index}`, {
      waitUntil: 'domcontentloaded'
    });
    await waitForText(chapterText);
    await page.goto(`${webBaseUrl}/sources`, { waitUntil: 'domcontentloaded' });
    await waitForText('Sources');
  } finally {
    await browser.close();
  }
}

export function createCandidateApiEnvironment({
  baseEnvironment,
  apiPort,
  webBaseUrl,
  storagePath
}) {
  const masterKey = baseEnvironment.SOURCE_READER_MASTER_KEY ?? randomBytes(32).toString('base64');
  return {
    ...baseEnvironment,
    HOST: '127.0.0.1',
    PORT: String(apiPort),
    STORAGE_DIR: storagePath,
    SOURCE_READER_PLUGIN_DIR: join(storagePath, 'source-plugins'),
    SOURCE_READER_LOCAL_ADMIN: 'true',
    SOURCE_READER_MASTER_KEY: masterKey,
    API_CORS_ORIGINS: webBaseUrl,
    OUTBOX_INTERVAL_MS: '3600000'
  };
}

function isSameOrNested(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

export async function createCandidateRuntimeStorage({ staging, workRoot }) {
  const stagingPath = resolve(staging);
  const root = resolve(workRoot);
  const path = join(root, `candidate-runtime-${randomUUID()}`);
  if (isSameOrNested(stagingPath, path) || isSameOrNested(path, stagingPath)) {
    throw new Error('Candidate runtime storage must be separate from staging');
  }
  await mkdir(root, { recursive: true });
  try {
    await cp(stagingPath, path, { recursive: true, preserveTimestamps: true });
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
  let cleaned = false;
  return {
    path,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await rm(path, { recursive: true, force: true });
    }
  };
}

export async function ensureCandidateSmokeProbe(storagePath) {
  const databasePath = await findStorageDatabase(storagePath);
  const database = new DatabaseSync(databasePath);
  let transactionOpen = false;
  try {
    const readable = database
      .prepare(
        `SELECT n.id
           FROM library_novels n
           JOIN library_chapters c ON c.novel_id = n.id
          WHERE c.source_available = 1
            AND c.status = 'fetched'
            AND COALESCE(c.clean_text, c.raw_text, '') <> ''
          LIMIT 1`
      )
      .get();
    if (readable) return { seeded: false };

    const novelId = `candidate-smoke-probe-${randomUUID()}`;
    const chapterId = `candidate-smoke-chapter-${randomUUID()}`;
    const timestamp = '9999-12-31T23:59:59.999Z';
    database.exec('BEGIN IMMEDIATE');
    transactionOpen = true;
    database
      .prepare(
        `INSERT INTO library_novels
          (id, title, source_url, source_name, author, cover_url, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        novelId,
        'Candidate Smoke Probe',
        `https://candidate-smoke.invalid/novels/${novelId}`,
        'candidate-smoke',
        'Novel Tool',
        null,
        'completed',
        timestamp,
        timestamp
      );
    database
      .prepare(
        `INSERT INTO library_chapters
          (id, novel_id, chapter_index, title, source_url, raw_text, clean_text, status,
           error_message, source_available, content_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        chapterId,
        novelId,
        1,
        'Candidate Smoke Chapter',
        `https://candidate-smoke.invalid/novels/${novelId}/chapters/1`,
        '<p>Candidate smoke chapter content.</p>',
        'Candidate smoke chapter content.',
        'fetched',
        null,
        1,
        1,
        timestamp,
        timestamp
      );
    database.exec('COMMIT');
    transactionOpen = false;
    return { seeded: true, novelId, chapterId };
  } catch (error) {
    if (transactionOpen) database.exec('ROLLBACK');
    throw error;
  } finally {
    database.close();
  }
}

export function assertSmokeableMigrationReport(report) {
  assertMigrationReport(report);
  if (report.validation.errors.length > 0) {
    throw new Error(
      `Candidate migration validation failed: ${report.validation.errors.join('; ')}`
    );
  }
  if (
    report.validation.idsPreserved !== true ||
    report.validation.timestampsPreserved !== true ||
    report.validation.searchRebuilt !== true
  ) {
    throw new Error('Candidate migration validation did not preserve required data');
  }
  for (const [name, counts] of Object.entries(report.validation.recordCounts)) {
    if (counts.source !== counts.candidate) {
      throw new Error(`Candidate migration validation count mismatch: ${name}`);
    }
  }
  return report;
}

export async function smokeCandidate(input) {
  if (input?.migrationReport) assertSmokeableMigrationReport(input.migrationReport);
  if (!input?.migrationReportPath || !input?.verificationReportPath || !input?.outputPath) {
    throw new Error('Candidate smoke requires migration and verification report paths');
  }
  const migrationReport = assertSmokeableMigrationReport(
    JSON.parse(await readFile(resolve(input.migrationReportPath), 'utf8'))
  );
  await validateMigrationReport({
    reportPath: input.migrationReportPath,
    staging: migrationReport.candidate.storagePath
  });
  await Promise.all([access(apiEntry), access(webEntry), access(vite)]);

  let apiReservation;
  let webReservation;
  let apiProcess;
  let webProcess;
  let runtimeStorage;
  let failure;
  let smoke;
  try {
    apiReservation = await reserveLoopbackPort();
    webReservation = await reserveLoopbackPort();
    const apiBaseUrl = `http://127.0.0.1:${apiReservation.port}`;
    const webBaseUrl = `http://127.0.0.1:${webReservation.port}`;
    const environment = input.environment ?? process.env;
    runtimeStorage = await createCandidateRuntimeStorage({
      staging: migrationReport.candidate.storagePath,
      workRoot: join(dirname(resolve(input.outputPath)), 'runtime')
    });
    await ensureCandidateSmokeProbe(runtimeStorage.path);
    const apiEnvironment = createCandidateApiEnvironment({
      baseEnvironment: environment,
      apiPort: apiReservation.port,
      webBaseUrl,
      storagePath: runtimeStorage.path
    });
    const secretValues = [
      apiEnvironment.SOURCE_READER_MASTER_KEY,
      environment.API_REMOTE_TOKEN,
      environment.SOURCE_READER_CURSOR_KEY,
      migrationReport.candidate.storagePath,
      runtimeStorage.path
    ].filter(Boolean);
    const logDirectory = join(dirname(resolve(input.outputPath)), 'logs');

    await apiReservation.release();
    apiReservation = undefined;
    apiProcess = await startManagedProcess({
      name: 'api',
      command: process.execPath,
      args: ['--experimental-sqlite', apiEntry],
      cwd: projectRoot,
      env: apiEnvironment,
      logPath: join(logDirectory, 'candidate-api.log'),
      secretValues
    });
    await waitForHttp(`${apiBaseUrl}/health`, { timeoutMs: input.timeoutMs ?? 30_000 });

    await webReservation.release();
    webReservation = undefined;
    webProcess = await startManagedProcess({
      name: 'web',
      command: process.execPath,
      args: [
        vite,
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        String(new URL(webBaseUrl).port),
        '--strictPort'
      ],
      cwd: webRoot,
      env: environment,
      logPath: join(logDirectory, 'candidate-web.log'),
      secretValues
    });
    await waitForHttp(`${webBaseUrl}/library`, { timeoutMs: input.timeoutMs ?? 30_000 });
    smoke = await runCandidateHttpSmoke({
      apiBaseUrl,
      webBaseUrl,
      secretValues,
      storagePath: runtimeStorage.path
    });
    await runCandidateBrowserSmoke({
      apiBaseUrl,
      webBaseUrl,
      timeoutMs: input.timeoutMs ?? 15_000,
      executablePath: environment.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    });
  } catch (error) {
    failure = error;
  }

  for (const processHandle of [webProcess, apiProcess]) {
    if (!processHandle) continue;
    try {
      await processHandle.stop();
    } catch (error) {
      failure ??= error;
    }
  }
  for (const reservation of [webReservation, apiReservation]) {
    if (!reservation) continue;
    try {
      await reservation.release();
    } catch (error) {
      failure ??= error;
    }
  }
  if (runtimeStorage) {
    try {
      await runtimeStorage.cleanup();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;

  return writeCandidateManifestFromEvidence({
    migrationReportPath: input.migrationReportPath,
    verificationReportPath: input.verificationReportPath,
    outputPath: input.outputPath,
    smoke
  });
}

function option(args, name) {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  smokeCandidate({
    migrationReportPath: option(args, '--migration-report'),
    verificationReportPath: option(args, '--verification-report'),
    outputPath: option(args, '--output')
  })
    .then((manifest) => process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`))
    .catch((error) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
      process.exitCode = 1;
    });
}
