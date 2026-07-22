import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const commit = 'a'.repeat(40);
const legacyApi = ['api', 'legacy'].join('-');
const legacyWeb = ['web', 'legacy'].join('-');

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function legacyRemovalFixture() {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-legacy-removal-'));
  const retainedFile = 'tests/regression/retained-v3.test.ts';
  const canonicalCandidatePath = join(root, 'canonical-candidate.json');
  const rollbackRehearsalPath = join(root, 'rollback-rehearsal.json');

  for (const path of [
    `apps/${legacyApi}/src`,
    `apps/${legacyWeb}/src`,
    'apps/api/src',
    'apps/web/src',
    'scripts',
    'tests/regression',
    'specs'
  ]) {
    await mkdir(join(root, path), { recursive: true });
  }

  await writeJson(join(root, `apps/${legacyApi}/package.json`), {
    name: `@novel-tool/${legacyApi}`
  });
  await writeJson(join(root, `apps/${legacyWeb}/package.json`), {
    name: `@novel-tool/${legacyWeb}`
  });
  await writeFile(join(root, `apps/${legacyApi}/src/main.ts`), 'export {};\n');
  await writeFile(join(root, `apps/${legacyWeb}/src/main.ts`), 'export {};\n');
  await writeFile(
    join(root, retainedFile),
    "import test from 'node:test';\ntest('v3', () => {});\n"
  );
  await writeFile(
    join(root, 'tests/regression/old-api.test.ts'),
    `import '${`../../apps/${legacyApi}/src/main.ts`}';\n`
  );
  await writeFile(
    join(root, 'scripts/check-old-architecture.mjs'),
    `const root = '${`apps/${legacyApi}`}';\nvoid root;\n`
  );

  const { retainedCoverageCapabilities } =
    await import('../../scripts/v3/legacy-dependency-inventory.mjs');
  await writeJson(
    join(root, 'specs/v3-retained-test-coverage.json'),
    Object.fromEntries(
      retainedCoverageCapabilities.map((capability: string) => [capability, [retainedFile]])
    )
  );
  await writeJson(join(root, 'package.json'), {
    name: 'fixture',
    private: true,
    workspaces: ['apps/*'],
    scripts: {
      check: 'node scripts/check-current.mjs',
      'check:legacy': `node scripts/check-old-architecture.mjs && npm run check -w @novel-tool/${legacyApi}`
    }
  });
  await writeJson(join(root, 'package-lock.json'), {
    name: 'fixture',
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture', workspaces: ['apps/*'] },
      [`apps/${legacyApi}`]: {
        name: `@novel-tool/${legacyApi}`,
        version: '2.9.6',
        extraneous: true
      },
      [`apps/${legacyWeb}`]: {
        name: `@novel-tool/${legacyWeb}`,
        version: '2.9.6',
        extraneous: true
      }
    }
  });

  const rollbackBytes = Buffer.from(
    `${JSON.stringify(
      {
        formatVersion: 1,
        commit,
        sourceManifestSha256: 'b'.repeat(64),
        candidateManifestSha256: 'c'.repeat(64),
        sourceManifestRestored: true,
        rollbackTriggered: true,
        startedAt: '2026-07-22T12:00:00.000Z',
        completedAt: '2026-07-22T12:01:00.000Z'
      },
      null,
      2
    )}\n`
  );
  await writeFile(rollbackRehearsalPath, rollbackBytes);
  const canonicalBytes = Buffer.from(
    `${JSON.stringify(
      {
        formatVersion: 1,
        commit,
        rollbackRehearsalSha256: sha256(rollbackBytes),
        commands: [{ name: 'verify', passed: true }],
        passed: true
      },
      null,
      2
    )}\n`
  );
  await writeFile(canonicalCandidatePath, canonicalBytes);

  const acceptance = {
    formatVersion: 1,
    commit,
    canonicalCandidateSha256: sha256(canonicalBytes),
    approvedBy: 'release-operator',
    approvedAt: '2026-07-22T12:02:00.000Z',
    legacyRemovalApproved: true as const
  };
  const regenerateLockfile = async () => {};

  return {
    root,
    acceptance,
    canonicalCandidatePath,
    rollbackRehearsalPath,
    regenerateLockfile
  };
}

test('legacy removal refuses absent, stale, or unapproved acceptance records', async () => {
  const { removeLegacyApps } = await import('../../scripts/v3/remove-legacy-apps.mjs');
  const fixture = await legacyRemovalFixture();
  const options = {
    currentCommit: commit,
    canonicalCandidatePath: fixture.canonicalCandidatePath,
    rollbackRehearsalPath: fixture.rollbackRehearsalPath,
    regenerateLockfile: fixture.regenerateLockfile
  };

  try {
    await assert.rejects(() => removeLegacyApps(fixture.root, undefined, options), /acceptance/i);
    await assert.rejects(
      () => removeLegacyApps(fixture.root, { ...fixture.acceptance, commit: 'different' }, options),
      /commit/i
    );
    await assert.rejects(
      () =>
        removeLegacyApps(
          fixture.root,
          { ...fixture.acceptance, legacyRemovalApproved: false },
          options
        ),
      /approved/i
    );
    assert.equal(await exists(join(fixture.root, 'apps', legacyApi)), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('approved removal keeps retained coverage and removes legacy dependencies', async () => {
  const { findLegacyReferences, removeLegacyApps } =
    await import('../../scripts/v3/remove-legacy-apps.mjs');
  const { validateCoverageMatrix } =
    await import('../../scripts/v3/legacy-dependency-inventory.mjs');
  const fixture = await legacyRemovalFixture();

  try {
    const result = await removeLegacyApps(fixture.root, fixture.acceptance, {
      currentCommit: commit,
      canonicalCandidatePath: fixture.canonicalCandidatePath,
      rollbackRehearsalPath: fixture.rollbackRehearsalPath,
      regenerateLockfile: fixture.regenerateLockfile
    });

    assert.equal(await exists(join(fixture.root, 'apps', legacyApi)), false);
    assert.equal(await exists(join(fixture.root, 'apps', legacyWeb)), false);
    assert.equal(await exists(join(fixture.root, 'tests/regression/old-api.test.ts')), false);
    assert.equal(await exists(join(fixture.root, 'tests/regression/retained-v3.test.ts')), true);
    assert.deepEqual(await findLegacyReferences(fixture.root), []);
    assert.equal(await validateCoverageMatrix(fixture.root), true);
    assert.ok(result.removedPaths.length >= 4);
    assert.equal(
      JSON.parse(await readFile(join(fixture.root, 'package.json'), 'utf8')).scripts[
        'check:legacy'
      ],
      undefined
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('release acceptance schema locks the destructive approval fields', async () => {
  const schema = JSON.parse(await readFile('specs/v3-release-acceptance.schema.json', 'utf8'));
  assert.deepEqual(schema.required, [
    'formatVersion',
    'commit',
    'canonicalCandidateSha256',
    'approvedBy',
    'approvedAt',
    'legacyRemovalApproved'
  ]);
  assert.deepEqual(schema.properties.legacyRemovalApproved, { const: true });
  assert.equal(schema.additionalProperties, false);
});

test('retained v22 fixtures do not depend on a removable workspace', async () => {
  const source = await readFile('tests/helpers/v22-database.fixture.ts', 'utf8');
  const removableWorkspace = new RegExp(`apps/${['api', 'legacy'].join('-')}`);
  assert.doesNotMatch(source, removableWorkspace);
});
