import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SourceReaderAuthorizationPolicy } from '../../apps/api/src/modules/source-reader/application/admin/policies/source-reader-authorization.policy.ts';
import { ExternalPluginRegistrationFactory } from '../../apps/api/src/modules/source-reader/application/admin/services/external-plugin-registration.factory.ts';
import { PluginActivationService } from '../../apps/api/src/modules/source-reader/application/admin/services/plugin-activation.service.ts';
import { PluginCompatibilityService } from '../../apps/api/src/modules/source-reader/application/admin/services/plugin-compatibility.service.ts';
import { PluginInstallationService } from '../../apps/api/src/modules/source-reader/application/admin/services/plugin-installation.service.ts';
import {
  ApprovePluginPermissionsUseCase,
  DisablePluginUseCase,
  EnablePluginUseCase,
  InstallSourcePluginUseCase,
  ListPluginsUseCase
} from '../../apps/api/src/modules/source-reader/application/admin/use-cases/plugins/manage-source-plugins.usecase.ts';
import { CandidateResolver } from '../../apps/api/src/modules/source-reader/application/services/candidate-resolver.ts';
import { HealthFallbackPolicy } from '../../apps/api/src/modules/source-reader/application/services/health-fallback.policy.ts';
import { InvocationCoordinator } from '../../apps/api/src/modules/source-reader/application/services/invocation-coordinator.ts';
import { PaginationCoordinator } from '../../apps/api/src/modules/source-reader/application/services/pagination-coordinator.ts';
import { ReaderCachePolicy } from '../../apps/api/src/modules/source-reader/application/services/reader-cache-policy.ts';
import { RuntimeContextResolverService } from '../../apps/api/src/modules/source-reader/application/services/runtime-context-resolver.service.ts';
import { SourceResultValidator } from '../../apps/api/src/modules/source-reader/application/services/source-result-validator.ts';
import { SourceReaderFacade } from '../../apps/api/src/modules/source-reader/application/source-reader.facade.ts';
import { SourceReaderError } from '../../apps/api/src/modules/source-reader/domain/errors/source-reader.error.ts';
import { SOURCE_READER_HOST_COMPATIBILITY } from '../../apps/api/src/modules/source-reader/domain/plugin/source-reader-host-compatibility.ts';
import { libraryMigrations } from '../../apps/api/src/modules/library/infrastructure/migrations/001-library-schema.ts';
import { sourceReaderMigrations } from '../../apps/api/src/modules/source-reader/infrastructure/migrations/001-source-reader-schema.ts';
import { NetworkRouteResolver } from '../../apps/api/src/modules/source-reader/infrastructure/network/network-route.resolver.ts';
import { SourcePluginPackageVerifier } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.ts';
import { StaticTrustStore } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/package-loader/static-trust.store.ts';
import { InMemoryPluginRegistry } from '../../apps/api/src/modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.ts';
import { CheerioHtmlParserAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/cheerio-html-parser.adapter.ts';
import { ExternalProcessSupervisor } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.ts';
import { SANDBOX_PROTOCOL_VERSION } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/external-process/sandbox-protocol.ts';
import { HmacCursorCodec } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/hmac-cursor.codec.ts';
import { InProcessPluginRuntime } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.ts';
import { PipelinePluginRegistryAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/pipeline-plugin-registry.adapter.ts';
import { PipelineRuntimeContextAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/pipeline-runtime-context.adapter.ts';
import { PipelineSourceReaderInvocationAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/pipeline-source-reader-invocation.adapter.ts';
import { PluginContextFactory } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/plugin-context.factory.ts';
import { RuntimeRouter } from '../../apps/api/src/modules/source-reader/infrastructure/runtime/runtime-router.ts';
import { LocalEncryptedVault } from '../../apps/api/src/modules/source-reader/infrastructure/secrets/local-encrypted.vault.ts';
import { PipelinePluginHealthAdapter } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/pipeline-plugin-health.adapter.ts';
import { SqliteCredentialRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-credential.repository.ts';
import { SqliteNetworkProfileRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-network-profile.repository.ts';
import { SqlitePluginHealthRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin-health.repository.ts';
import { SqlitePluginStore } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts';
import { SqliteReaderCache } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-reader.cache.ts';
import { SqliteSessionRepository } from '../../apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-session.repository.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';
import { buildFullApplication } from '../../scripts/cli/commands/build.mjs';
import { packageFirstPartySourcePlugin } from '../../scripts/cli/lib/first-party-source-plugin.mjs';

const timestamp = '2026-07-26T00:00:00.000Z';
const clock = { now: () => new Date(timestamp) };
const actor = { id: 'admin-1', roles: ['source-admin'] as const };
const novelUrl = 'https://novelcool.com/novel/original/id-251898.html';
const chapterUrl = 'https://novelcool.com/chapter/Chapter-931-Not-a-Lonely-Birthday/14115083.html';

function migratedDatabase(t: test.TestContext): SqliteDatabase {
  const database = new SqliteDatabase(':memory:');
  for (const migration of [...libraryMigrations, ...sourceReaderMigrations]) {
    migration.up(database.connection);
  }
  t.after(() => database.close());
  return database;
}

function isUnsupportedSource(error: unknown): boolean {
  return error instanceof SourceReaderError && error.code === 'SOURCE_NOT_SUPPORTED';
}

test('generated NovelCool package installs, activates in isolation, invokes, and disables', async (t) => {
  const database = migratedDatabase(t);
  database.connection
    .prepare(
      `INSERT INTO library_novels
       (id, title, source_url, source_name, author, cover_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      'existing-novel',
      'Existing Novel',
      'https://novelcool.com/novel/existing/id-1.html',
      'NovelCool',
      null,
      null,
      'completed',
      '2026-07-25T00:00:00.000Z',
      '2026-07-25T00:00:00.000Z'
    );
  const existingLibraryRow = database.connection
    .prepare('SELECT id, title, source_url, status FROM library_novels WHERE id = ?')
    .get('existing-novel');

  const pluginRoot = await mkdtemp(join(tmpdir(), 'novelcool-external-plugin-'));
  const buildRoot = await mkdtemp(join(tmpdir(), 'novelcool-external-build-'));
  t.after(() => rm(pluginRoot, { recursive: true, force: true }));
  t.after(() => rm(buildRoot, { recursive: true, force: true }));
  const distRoot = join(buildRoot, 'dist');
  const ids = { randomId: randomUUID };
  const pluginStore = new SqlitePluginStore(database);
  const registry = new InMemoryPluginRegistry();
  const verifier = new SourcePluginPackageVerifier(new StaticTrustStore([]));
  const supervisor = new ExternalProcessSupervisor({
    startupTimeoutMs: 30_000,
    cancelGraceMs: 20,
    now: () => clock.now().getTime()
  });
  t.after(() => supervisor.stop('novelcool', '2.0.0', 'application-stop'));
  const registrationFactory = new ExternalPluginRegistrationFactory({
    supervisor,
    timeoutMs: 10_000,
    now: clock.now,
    randomId: randomUUID,
    protocolVersion: SANDBOX_PROTOCOL_VERSION
  });
  const installer = new PluginInstallationService(
    verifier,
    pluginStore,
    pluginRoot,
    ids,
    clock,
    new PluginCompatibilityService(SOURCE_READER_HOST_COMPATIBILITY)
  );
  const activation = new PluginActivationService(
    pluginStore,
    registry,
    supervisor,
    registrationFactory,
    clock,
    ids,
    10_000
  );
  const authorization = new SourceReaderAuthorizationPolicy();
  const management = {
    install: new InstallSourcePluginUseCase(authorization, installer),
    approve: new ApprovePluginPermissionsUseCase(authorization, pluginStore, clock),
    enable: new EnablePluginUseCase(authorization, activation),
    disable: new DisablePluginUseCase(authorization, activation),
    list: new ListPluginsUseCase(authorization, pluginStore)
  };

  const [novelFixtureHtml, chapterHtml] = await Promise.all([
    readFile('plugins/novelcool/tests/fixtures/novel.html', 'utf8'),
    readFile('plugins/novelcool/tests/fixtures/chapter-valid.html', 'utf8')
  ]);
  // Real NovelCool detail pages can approach 1 MiB before the plugin extracts metadata.
  const chapterLinks = Array.from(
    { length: 934 },
    (_, index) =>
      `<a href="/chapter/Chapter-${index + 1}/${index + 1}.html">Chapter ${index + 1}</a>`
  ).join('');
  const novelHtml = novelFixtureHtml
    .replace(
      /<div class="chapter-list">[\s\S]*?<\/div>/,
      `<div class="chapter-list">${chapterLinks}</div>`
    )
    .replace('</body>', `<!--${'x'.repeat(900 * 1024)}--></body>`);
  const http = {
    async get(url: string) {
      return {
        url,
        status: 200,
        headers: {},
        data: url.includes('/chapter/') ? chapterHtml : novelHtml
      };
    }
  };
  const vault = new LocalEncryptedVault(Buffer.alloc(32, 7));
  const credentials = new SqliteCredentialRepository(database, vault);
  const networks = new SqliteNetworkProfileRepository(database, vault);
  const sessions = new SqliteSessionRepository(database, vault);
  const runtime = new RuntimeRouter(new InProcessPluginRuntime(), supervisor, 10_000);
  const contextFactory = new PluginContextFactory(
    http,
    new CheerioHtmlParserAdapter(),
    clock,
    { info() {}, warn() {}, error() {} },
    sessions
  );
  const contextResolver = new RuntimeContextResolverService(
    credentials,
    networks,
    sessions,
    new NetworkRouteResolver(networks)
  );
  const facade = new SourceReaderFacade({
    requestGate: { assertAllowed: async () => undefined },
    candidates: new CandidateResolver(new PipelinePluginRegistryAdapter(registry)),
    contexts: new PipelineRuntimeContextAdapter(contextResolver),
    cache: new ReaderCachePolicy(new SqliteReaderCache(database), clock),
    invocation: new InvocationCoordinator(
      new PipelineSourceReaderInvocationAdapter({
        registry,
        runtime,
        contextFactory
      })
    ),
    pagination: new PaginationCoordinator(new HmacCursorCodec(Buffer.alloc(32, 3), clock), clock),
    health: new HealthFallbackPolicy(
      new PipelinePluginHealthAdapter(
        new SqlitePluginHealthRepository(database),
        clock,
        randomUUID
      ),
      clock
    ),
    validator: new SourceResultValidator()
  });

  await assert.rejects(() => facade.readMetadata({ url: novelUrl }), isUnsupportedSource);

  await buildFullApplication({
    distRoot,
    buildId: 'external-novelcool-integration',
    packageFirstPartyPlugins: async ({ root: projectRoot, outputDirectory }) =>
      packageFirstPartySourcePlugin({
        root: projectRoot,
        workspaceRoot: join(projectRoot, 'plugins', 'novelcool'),
        outputDirectory,
        verifier
      }),
    buildWeb: async ({ outDir }) => {
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, 'index.html'), '<div id="root"></div>');
    }
  });
  const artifactPath = join(distRoot, 'plugins', 'novelcool-2.0.0.source-plugin');
  const bytes = await readFile(artifactPath);
  const installed = await management.install.execute({
    actor,
    bytes,
    originalName: 'novelcool-2.0.0.source-plugin'
  });
  assert.equal(installed.pluginId, 'novelcool');
  assert.equal(installed.version, '2.0.0');
  assert.equal(installed.status, 'pending-approval');

  const [pending] = (await management.list.execute({ actor })) as Array<{
    pluginId: string;
    latestVersion?: string;
    activeVersion?: string;
    permissionsPending: boolean;
    enabled: boolean;
  }>;
  assert.equal(pending?.latestVersion, '2.0.0');
  assert.equal(pending && 'activeVersion' in pending, false);
  assert.equal(pending?.permissionsPending, true);
  assert.equal(pending?.enabled, false);
  await assert.rejects(
    () => management.enable.execute({ actor, pluginId: 'novelcool', version: '2.0.0' }),
    (error: unknown) =>
      error instanceof SourceReaderError && error.code === 'PLUGIN_PERMISSION_DENIED'
  );

  await management.approve.execute({ actor, pluginId: 'novelcool', version: '2.0.0' });
  const [approved] = (await management.list.execute({ actor })) as Array<{
    latestVersion?: string;
    activeVersion?: string;
    permissionsPending: boolean;
  }>;
  assert.equal(approved?.latestVersion, '2.0.0');
  assert.equal(approved && 'activeVersion' in approved, false);
  assert.equal(approved?.permissionsPending, false);
  await management.enable.execute({ actor, pluginId: 'novelcool', version: '2.0.0' });

  const metadata = await facade.readMetadata({ url: novelUrl });
  assert.equal(metadata.data.title, 'Fixture Novel');
  assert.equal(metadata.source.pluginVersion, '2.0.0');
  const chapterList = await facade.readChapterList({ url: novelUrl, limit: 200 });
  assert.equal(chapterList.data.items.length, 200);
  assert.equal(chapterList.data.hasMore, true);
  const chapter = await facade.readChapterContent({ url: chapterUrl });
  assert.match(chapter.data.cleanText, /fixture chapter body/i);

  const plugins = (await management.list.execute({ actor })) as Array<{
    pluginId: string;
    latestVersion?: string;
    activeVersion?: string;
    trustLevel: string;
    status: string;
    enabled: boolean;
  }>;
  const novelcool = plugins.find((item) => item.pluginId === 'novelcool');
  assert.equal(novelcool?.latestVersion, '2.0.0');
  assert.equal(novelcool?.activeVersion, '2.0.0');
  assert.equal(novelcool?.trustLevel, 'local-unverified');
  assert.equal(novelcool?.status, 'active');
  assert.equal(novelcool?.enabled, true);
  assert.equal(registry.findById('novelcool')?.executionMode, 'isolated');

  await management.disable.execute({ actor, pluginId: 'novelcool' });
  assert.equal(registry.findById('novelcool'), undefined);
  await assert.rejects(() => facade.readMetadata({ url: novelUrl }), isUnsupportedSource);
  assert.deepEqual(
    database.connection
      .prepare('SELECT id, title, source_url, status FROM library_novels WHERE id = ?')
      .get('existing-novel'),
    existingLibraryRow
  );
});
