import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginActivationService } from '../../apps/api/src/modules/source-reader/application/services/plugin-activation.service.ts';
import type { ExternalPluginProcessHandle } from '../../apps/api/src/modules/source-reader/application/ports/external-plugin-supervisor.port.ts';
import type {
  PluginRegistryPort,
  PreparedPluginRegistrySnapshot,
  RegisteredPlugin
} from '../../apps/api/src/modules/source-reader/application/ports/plugin-registry.port.ts';
import type {
  PluginStorePort,
  StoredPluginVersion
} from '../../apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts';

const manifest = (version: string) => ({
  id: 'demo',
  name: 'Demo',
  version,
  engines: { sourceReader: '>=2.9.6 <3' },
  capabilities: ['metadata' as const],
  contracts: { metadata: 1 },
  matchers: [{ hosts: ['example.test'], priority: 10 }],
  runtime: { preferredMode: 'isolated' as const },
  permissions: { network: { hosts: ['example.test'] } }
});

function stored(version: string, status: StoredPluginVersion['status']): StoredPluginVersion {
  return {
    pluginId: 'demo',
    version,
    trustLevel: 'local-unverified',
    status,
    packagePath: `/plugins/demo/${version}`,
    checksum: `checksum-${version}`,
    signatureStatus: 'unsigned',
    manifest: manifest(version)
  };
}

function registration(version: string): RegisteredPlugin {
  return {
    plugin: { manifest: manifest(version) },
    trustLevel: 'local-unverified',
    executionMode: 'isolated',
    enabled: true,
    packagePath: `/plugins/demo/${version}`
  };
}

function fixture(
  options: {
    failInitialize?: boolean;
    degradedHealth?: boolean;
    failPrepare?: boolean;
    failPublish?: boolean;
    failDisable?: boolean;
    failQuarantine?: boolean;
    failOldShutdown?: boolean;
  } = {}
) {
  const events: string[] = [];
  const previous = stored('1.0.0', 'active');
  const candidate = stored('2.0.0', 'installed');
  let activeVersion: string | undefined = previous.version;
  let live = new Map([['demo', registration(previous.version)]]);
  let publishAttempts = 0;

  const candidateHandle: ExternalPluginProcessHandle = {
    pluginId: 'demo',
    pluginVersion: candidate.version,
    async request(request) {
      if (request.operation === 'initialize') {
        events.push('candidate.initialize');
        if (options.failInitialize) throw new Error('initialize failed');
        return undefined;
      }
      if (request.operation === 'healthCheck') {
        events.push('candidate.health');
        return { status: options.degradedHealth ? 'degraded' : 'healthy' };
      }
      throw new Error(`unexpected operation ${request.operation}`);
    },
    async terminate() {
      events.push('candidate.terminate');
    }
  };
  const oldHandle: ExternalPluginProcessHandle = {
    pluginId: 'demo',
    pluginVersion: previous.version,
    async request(request) {
      assert.equal(request.operation, 'shutdown');
      events.push('old.shutdown');
      if (options.failOldShutdown) throw new Error('shutdown failed');
      return undefined;
    },
    async terminate() {
      events.push('old.terminate');
    }
  };

  const store = {
    async findVersion(pluginId: string, version: string) {
      return pluginId === 'demo' && version === candidate.version ? candidate : undefined;
    },
    async findActive(pluginId: string) {
      if (pluginId !== 'demo' || !activeVersion) return undefined;
      return activeVersion === previous.version ? previous : candidate;
    },
    async permissionsApproved() {
      return true;
    },
    async activateCandidateAtomically() {
      events.push('store.publish');
      activeVersion = candidate.version;
    },
    async restoreActivation(_pluginId: string, version: string | undefined) {
      events.push('store.restore');
      activeVersion = version;
    },
    async disable() {
      events.push('store.disable');
      if (options.failDisable) throw new Error('disable failed');
      activeVersion = undefined;
    },
    async quarantine() {
      events.push('store.quarantine');
      if (options.failQuarantine) throw new Error('quarantine failed');
      activeVersion = undefined;
    },
    async recordActivationFailure() {
      events.push('store.failure');
    }
  } as Pick<
    PluginStorePort,
    | 'findVersion'
    | 'findActive'
    | 'permissionsApproved'
    | 'activateCandidateAtomically'
    | 'disable'
    | 'quarantine'
    | 'recordActivationFailure'
  > & {
    restoreActivation(pluginId: string, version: string | undefined): Promise<void>;
  };

  const prepared: PreparedPluginRegistrySnapshot = {
    registrations: new Map([['demo', registration(candidate.version)]])
  };
  const registry = {
    snapshot: () => new Map(live),
    prepareRegistration: () => {
      if (options.failPrepare) throw new Error('resolution failed');
      return prepared;
    },
    publishPrepared: (snapshot: PreparedPluginRegistrySnapshot) => {
      publishAttempts += 1;
      events.push('registry.publish');
      if (options.failPublish && publishAttempts === 1) throw new Error('publication failed');
      live = new Map(snapshot.registrations);
    },
    findById: () => live.get('demo')
  } as Pick<
    PluginRegistryPort,
    'snapshot' | 'prepareRegistration' | 'publishPrepared' | 'findById'
  >;

  const supervisor = {
    async start() {
      return candidateHandle;
    },
    get(_pluginId: string, version: string) {
      return version === previous.version
        ? oldHandle
        : version === candidate.version
          ? candidateHandle
          : undefined;
    },
    async stop() {}
  };

  const service = new PluginActivationService(
    store,
    registry,
    supervisor,
    { now: () => new Date('2026-07-20T00:00:00.000Z') },
    { randomId: () => 'request-1' },
    5_000
  );

  return {
    service,
    events,
    activeVersion: () => activeVersion,
    registryVersion: () => live.get('demo')?.plugin.manifest.version
  };
}

test('publishes a healthy candidate atomically before shutting down the old version', async () => {
  const { service, events } = fixture();
  const result = await service.activate({
    pluginId: 'demo',
    version: '2.0.0',
    signal: new AbortController().signal
  });

  assert.equal(result.status, 'active');
  assert.deepEqual(events, [
    'candidate.initialize',
    'candidate.health',
    'store.publish',
    'registry.publish',
    'old.shutdown'
  ]);
});

for (const [name, options] of [
  ['initialize failure', { failInitialize: true }],
  ['health failure', { degradedHealth: true }],
  ['registry resolution failure', { failPrepare: true }]
] as const) {
  test(`${name} preserves the previous active version`, async () => {
    const { service, events } = fixture(options);
    await assert.rejects(
      service.activate({
        pluginId: 'demo',
        version: '2.0.0',
        signal: new AbortController().signal
      }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'PLUGIN_LIFECYCLE_FAILED'
    );
    assert.equal(events.includes('store.publish'), false);
    assert.equal(events.includes('registry.publish'), false);
    assert.equal(events.includes('old.shutdown'), false);
    assert.equal(events.includes('candidate.terminate'), true);
    assert.equal(events.includes('store.failure'), true);
  });
}

test('registry publication failure restores the previous database and registry state', async () => {
  const { service, activeVersion, registryVersion, events } = fixture({ failPublish: true });

  await assert.rejects(
    service.activate({
      pluginId: 'demo',
      version: '2.0.0',
      signal: new AbortController().signal
    }),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'PLUGIN_LIFECYCLE_FAILED'
  );

  assert.equal(activeVersion(), '1.0.0');
  assert.equal(registryVersion(), '1.0.0');
  assert.equal(events.includes('store.restore'), true);
  assert.equal(events.includes('candidate.terminate'), true);
  assert.equal(events.includes('old.shutdown'), false);
});

test('disable store failure leaves the active registry registration untouched', async () => {
  const { service, activeVersion, registryVersion } = fixture({ failDisable: true });

  await assert.rejects(service.disable('demo'), /disable failed/);

  assert.equal(activeVersion(), '1.0.0');
  assert.equal(registryVersion(), '1.0.0');
});

test('quarantine store failure leaves the active registry registration untouched', async () => {
  const { service, activeVersion, registryVersion } = fixture({ failQuarantine: true });

  await assert.rejects(service.quarantine('demo', '1.0.0', 'policy'), /quarantine failed/);

  assert.equal(activeVersion(), '1.0.0');
  assert.equal(registryVersion(), '1.0.0');
});

test('old-version shutdown failure does not roll back the published candidate', async () => {
  const { service, events } = fixture({ failOldShutdown: true });
  const result = await service.activate({
    pluginId: 'demo',
    version: '2.0.0',
    signal: new AbortController().signal
  });

  assert.equal(result.status, 'active');
  assert.deepEqual(events.slice(0, 4), [
    'candidate.initialize',
    'candidate.health',
    'store.publish',
    'registry.publish'
  ]);
  assert.equal(result.warnings[0]?.code, 'PLUGIN_LIFECYCLE_FAILED');
});
