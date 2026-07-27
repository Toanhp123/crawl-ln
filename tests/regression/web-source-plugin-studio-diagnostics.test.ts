import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  summarizeSourcePluginStudioDiagnostics,
  type SourcePluginStudioDiagnostic
} from '../../apps/web/src/widgets/source-plugin-studio/model/source-plugin-studio-diagnostics.ts';

const diagnostics: SourcePluginStudioDiagnostic[] = [
  { path: 'src/index.ts', severity: 'error', message: 'Broken type', line: 4, column: 2 },
  { path: 'src/parser.ts', severity: 'warning', message: 'Unused value', line: 8, column: 1 },
  { path: 'src/parser.ts', severity: 'error', message: 'Missing return', line: 12, column: 5 }
];

test('Studio diagnostics summarize errors and warnings across files', () => {
  assert.deepEqual(summarizeSourcePluginStudioDiagnostics(diagnostics), {
    errors: 2,
    warnings: 1,
    total: 3
  });
});

test('Monaco Studio configuration registers SDK typings and strict compiler options', async () => {
  const [source, sdkTypes] = await Promise.all([
    readFile(
      'apps/web/src/widgets/source-plugin-studio/model/configure-source-plugin-studio-monaco.ts',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/model/source-plugin-studio-sdk-types.ts',
      'utf8'
    )
  ]);
  assert.match(source, /addExtraLib/);
  assert.match(sdkTypes, /@novel-tool\/source-plugin-sdk/);
  assert.match(source, /strict:\s*true/);
  assert.match(source, /ScriptTarget\.ES2020/);
  assert.match(source, /ModuleKind\.ESNext/);
  assert.match(source, /ModuleResolutionKind\.NodeJs/);
  assert.doesNotMatch(source, /NodeNext/);
});

test('Studio workbench exposes diagnostics and opens their source locations', async () => {
  const [workbench, panel, toolbar] = await Promise.all([
    readFile('apps/web/src/widgets/source-plugin-studio/ui/PluginStudioWorkbench.tsx', 'utf8'),
    readFile('apps/web/src/widgets/source-plugin-studio/ui/PluginStudioDiagnostics.tsx', 'utf8'),
    readFile('apps/web/src/widgets/source-plugin-studio/ui/PluginStudioToolbar.tsx', 'utf8')
  ]);
  assert.match(workbench, /useSourcePluginStudioDiagnostics/);
  assert.match(workbench, /selectFile\(diagnostic\.path\)/);
  assert.match(workbench, /line:\s*diagnostic\.line/);
  assert.match(panel, /diagnostic\.line/);
  assert.match(toolbar, /diagnosticSummary/);
});
