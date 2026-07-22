import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function source(file: string) {
  return readFile(file, 'utf8');
}

test('large Source Reader features are split into focused files', async () => {
  const expected = [
    'apps/web-legacy/src/features/manage-source-network-profile/ui/NetworkProfileForm.tsx',
    'apps/web-legacy/src/features/manage-source-network-profile/ui/CreateSourceNetworkProfileButton.tsx',
    'apps/web-legacy/src/features/manage-source-network-profile/ui/EditSourceNetworkProfileButton.tsx',
    'apps/web-legacy/src/features/manage-source-network-profile/ui/SourceNetworkProfileActions.tsx',
    'apps/web-legacy/src/features/manage-source-credential/ui/CredentialSecretEditor.tsx',
    'apps/web-legacy/src/features/manage-source-credential/ui/CreateSourceCredentialButton.tsx',
    'apps/web-legacy/src/features/manage-source-credential/ui/ReplaceSourceCredentialSecretButton.tsx',
    'apps/web-legacy/src/features/manage-source-credential/ui/DeleteSourceCredentialButton.tsx',
    'apps/web-legacy/src/features/inspect-source-url/ui/SourceInspectorForm.tsx'
  ];
  for (const file of expected) assert.equal(await exists(file), true, file);
  for (const removed of [
    'apps/web-legacy/src/features/manage-source-network-profile/ui/ManageSourceNetworkProfile.tsx',
    'apps/web-legacy/src/features/manage-source-credential/ui/ManageSourceCredential.tsx'
  ])
    assert.equal(await exists(removed), false, removed);
  for (const file of expected) {
    const lineCount = (await source(file)).split('\n').length;
    assert.ok(lineCount <= 220, `${file} has ${lineCount} lines`);
  }
});

test('administration overlays use the adaptive Drawer and result output uses ScrollViewport', async () => {
  const drawer = await source('apps/web-legacy/src/shared/ui/overlay/Drawer.tsx');
  assert.match(drawer, /bottom-0/);
  assert.match(drawer, /md:right-0/);
  for (const file of [
    'apps/web-legacy/src/features/manage-source-network-profile/ui/CreateSourceNetworkProfileButton.tsx',
    'apps/web-legacy/src/features/manage-source-network-profile/ui/EditSourceNetworkProfileButton.tsx',
    'apps/web-legacy/src/features/manage-source-credential/ui/CreateSourceCredentialButton.tsx',
    'apps/web-legacy/src/features/manage-source-credential/ui/ReplaceSourceCredentialSecretButton.tsx'
  ]) {
    const value = await source(file);
    assert.match(value, /<Drawer/);
    assert.doesNotMatch(value, /BottomSheet/);
  }
  const result = await source(
    'apps/web-legacy/src/features/inspect-source-url/ui/SourceReaderResultView.tsx'
  );
  assert.match(result, /ScrollViewport/);
  assert.match(result, /as="div"/);
  assert.doesNotMatch(result, /max-h-\[32rem\]/);
});

test('Source Reader web clients use exact management response types', async () => {
  for (const file of [
    'apps/web-legacy/src/entities/source-credential/api/sourceCredentialApi.ts',
    'apps/web-legacy/src/entities/source-network-profile/api/sourceNetworkProfileApi.ts',
    'apps/web-legacy/src/entities/source-plugin/api/sourcePluginApi.ts'
  ]) {
    const value = await source(file);
    assert.doesNotMatch(value, /http<Record<string, unknown>>/, file);
  }
  const plugin = await source('apps/web-legacy/src/entities/source-plugin/api/sourcePluginApi.ts');
  assert.doesNotMatch(plugin, /SourceReaderPluginDiagnostics \| SourceReaderPluginHealthResult/);
});
