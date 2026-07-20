import assert from 'node:assert/strict';
import test from 'node:test';
import { PluginCompatibilityService } from '../../apps/api/src/modules/source-reader/application/services/plugin-compatibility.service.ts';
import { SOURCE_READER_HOST_COMPATIBILITY } from '../../apps/api/src/modules/source-reader/domain/plugin/source-reader-host-compatibility.ts';
import type { SourcePluginManifest } from '../../apps/api/src/modules/source-reader/domain/plugin/source-plugin.ts';

function manifest(overrides: Partial<SourcePluginManifest> = {}): SourcePluginManifest {
  return {
    id: 'demo',
    name: 'Demo',
    version: '1.0.0',
    engines: { sourceReader: '^2.9.6' },
    capabilities: ['metadata'],
    contracts: { metadata: 1 },
    matchers: [{ hosts: ['example.test'], priority: 10 }],
    runtime: { preferredMode: 'isolated' },
    permissions: { network: { hosts: ['example.test'] } },
    ...overrides
  };
}

const schemaFile = new TextEncoder().encode(
  JSON.stringify({ type: 'object', properties: { token: { type: 'string' } }, required: ['token'] })
);

const service = new PluginCompatibilityService(SOURCE_READER_HOST_COMPATIBILITY);

for (const [name, input, code] of [
  [
    'invalid runtime range',
    manifest({ engines: { sourceReader: 'not-a-range' } }),
    'PLUGIN_RUNTIME_INCOMPATIBLE'
  ],
  [
    'unsupported runtime range',
    manifest({ engines: { sourceReader: '>=99.0.0' } }),
    'PLUGIN_RUNTIME_INCOMPATIBLE'
  ],
  [
    'unsupported capability contract',
    manifest({ contracts: { metadata: 2 } }),
    'PLUGIN_CAPABILITY_CONTRACT_UNSUPPORTED'
  ],
  [
    'unsupported extension version',
    manifest({
      extensionContracts: {
        'source-reader/form-login': {
          version: 2,
          schema: 'schemas/form-login.json',
          required: true
        }
      }
    }),
    'PLUGIN_EXTENSION_CONTRACT_UNSUPPORTED'
  ]
] as const) {
  test(name, () => {
    const report = service.evaluate(input, new Map([['schemas/form-login.json', schemaFile]]));
    assert.equal(report.compatible, false);
    assert.equal(
      report.issues.some((issue) => issue.code === code && issue.severity === 'fatal'),
      true
    );
  });
}

test('required invalid extension schema is fatal', () => {
  const report = service.evaluate(
    manifest({
      extensionContracts: {
        'source-reader/form-login': {
          version: 1,
          schema: 'schemas/form-login.json',
          required: true
        }
      }
    }),
    new Map([['schemas/form-login.json', new TextEncoder().encode('{not-json')]])
  );
  assert.equal(report.compatible, false);
  assert.equal(
    report.issues.some(
      (issue) => issue.code === 'PLUGIN_EXTENSION_SCHEMA_INVALID' && issue.severity === 'fatal'
    ),
    true
  );
});

test('optional invalid extension schema is omitted with a deterministic warning', () => {
  const report = service.evaluate(
    manifest({
      extensionContracts: {
        'source-reader/form-login': {
          version: 1,
          schema: 'schemas/form-login.json',
          required: false
        }
      }
    }),
    new Map([['schemas/form-login.json', new TextEncoder().encode('{not-json')]])
  );
  assert.equal(report.compatible, true);
  assert.deepEqual(report.activatedExtensions, {});
  assert.equal(report.issues[0]?.severity, 'warning');
});

test('valid extension schema is activated and issues are sorted deterministically', () => {
  const report = service.evaluate(
    manifest({
      extensionContracts: {
        'source-reader/form-login': {
          version: 1,
          schema: 'schemas/form-login.json',
          required: true
        }
      }
    }),
    new Map([['schemas/form-login.json', schemaFile]])
  );
  assert.equal(report.compatible, true);
  assert.deepEqual(report.activatedExtensions, {
    'source-reader/form-login': {
      version: 1,
      schema: 'schemas/form-login.json',
      required: true
    }
  });
  assert.deepEqual(
    report.issues,
    [...report.issues].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code))
  );
});
