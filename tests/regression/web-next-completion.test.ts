import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import { checkWebNextArchitecture } from '../../scripts/lib/web-next-architecture.mjs';
import { checkWebContracts } from '../../scripts/lib/web-contracts.mjs';

async function readTree(directory: string, root = directory): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(await readTree(target, root));
    else parts.push(`\n/* ${relative(root, target)} */\n${await readFile(target, 'utf8')}`);
  }
  return parts.join('\n');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('every final frontend slice has a public index and real route loader', async () => {
  assert.deepEqual(await checkWebNextArchitecture(process.cwd()), []);
  for (const directory of [
    'source-reader-overview',
    'source-plugin-details',
    'source-credentials-panel',
    'source-network-profiles-panel',
    'source-auth-challenges-panel',
    'source-inspector',
    'system-health'
  ]) {
    assert.equal(await exists(`apps/web-next/src/widgets/${directory}/index.ts`), true);
  }
  for (const page of ['sources', 'settings']) {
    assert.equal(await exists(`apps/web-next/src/pages/${page}/index.ts`), true);
  }
  const preload = await readFile('apps/web-next/src/app/router/route-preload.ts', 'utf8');
  assert.match(preload, /import\(['"]@\/pages\/sources['"]\)/);
  assert.match(preload, /import\(['"]@\/pages\/settings['"]\)/);
});

test('Sources page preserves section URL state and composes public administration slices', async () => {
  const source = await readTree('apps/web-next/src/pages/sources');
  assert.match(source, /useSearchParams/);
  for (const section of ['plugins', 'credentials', 'network', 'challenges', 'inspector']) {
    assert.match(source, new RegExp(section));
  }
  for (const widget of [
    'SourceReaderOverview',
    'SourceCredentialsPanel',
    'SourceNetworkProfilesPanel',
    'SourceAuthChallengesPanel',
    'SourceInspector',
    'SourcePluginDetails',
    'InstallSourcePluginForm'
  ]) {
    assert.match(source, new RegExp(widget));
  }
  assert.doesNotMatch(source, /useQuery\(|useMutation\(|\bhttp\s*\(|fetch\s*\(/);
});

test('Sources widgets keep reads and writes in public entity and feature APIs', async () => {
  const source = await Promise.all(
    [
      'source-reader-overview',
      'source-plugin-details',
      'source-credentials-panel',
      'source-network-profiles-panel',
      'source-auth-challenges-panel',
      'source-inspector'
    ].map((name) => readTree(`apps/web-next/src/widgets/${name}`))
  );
  const joined = source.join('\n');
  for (const marker of [
    'useSourcePlugins',
    'useSourceCredentials',
    'useSourceNetworkProfiles',
    'useSourceAuthChallenges',
    'SourcePluginEnableSwitch',
    'ReviewSourcePermissions',
    'SourceCredentialAuthActions',
    'SourceNetworkProfileActions',
    'ResolveSourceAuthChallenge',
    'InspectSourceUrl'
  ]) {
    assert.match(joined, new RegExp(marker));
  }
  assert.doesNotMatch(joined, /@\/entities\/[^/'"]+\/(?:api|model|ui)\//);
  assert.doesNotMatch(joined, /@\/features\/[^/'"]+\/(?:api|model|ui|lib)\//);
});

test('Settings page composes preferences health maintenance backup search and build metadata', async () => {
  const source = await readTree('apps/web-next/src/pages/settings');
  for (const marker of [
    'AppearanceControls',
    'LanguageControls',
    'ReaderPreferencesSheet',
    'RunSchedulerButton',
    'BackupLibraryPanel',
    'RebuildSearchIndexButton',
    'SystemHealthCard',
    'APP_VERSION',
    'APP_BUILD'
  ]) {
    assert.match(source, new RegExp(marker));
  }
  assert.doesNotMatch(source, /useQuery\(|useMutation\(|\bhttp\s*\(|fetch\s*\(/);
});

test('contract checker accepts current and next frontend roots independently', async () => {
  assert.deepEqual(await checkWebContracts('apps/web/src'), []);
  assert.deepEqual(await checkWebContracts('apps/web-next/src'), []);
});

test('frontend completion scripts and dual-preview config are present', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  assert.equal(
    packageJson.scripts['check:web-next-contracts'],
    'node scripts/check-web-next-contracts.mjs'
  );
  assert.equal(
    packageJson.scripts['test:e2e:web-next'],
    'playwright test --config playwright.web-next.config.ts'
  );
  assert.match(packageJson.scripts['verify:v3:frontend'], /check:web-next-contracts/);
  assert.match(packageJson.scripts['verify:v3:frontend'], /test:e2e:web-next/);

  const config = await readFile('playwright.web-next.config.ts', 'utf8');
  assert.match(config, /4173/);
  assert.match(config, /4174/);
  assert.match(config, /@novel-tool\/web-next/);
  assert.match(config, /baseURL:\s*['"]http:\/\/127\.0\.0\.1:4174['"]/);
});
