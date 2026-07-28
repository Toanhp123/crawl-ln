import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PLUGIN_STUDIO_LAYOUT,
  resolvePluginStudioLayoutMode,
  resizePluginStudioSidebar
} from '../../apps/web/src/widgets/source-plugin-studio/model/source-plugin-studio-layout.ts';

test('project creation exposes modal-safe fields and shared draft state', async () => {
  const [draft, fields, legacyForm, installForm] = await Promise.all([
    readFile(
      'apps/web/src/features/create-source-plugin-project/model/use-create-source-plugin-project-draft.ts',
      'utf8'
    ),
    readFile(
      'apps/web/src/features/create-source-plugin-project/ui/CreateSourcePluginProjectFields.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/features/create-source-plugin-project/ui/CreateSourcePluginProjectForm.tsx',
      'utf8'
    ),
    readFile('apps/web/src/features/install-source-plugin/ui/InstallSourcePluginForm.tsx', 'utf8')
  ]);

  assert.match(draft, /useCreateSourcePluginProjectDraft/);
  assert.match(draft, /canSubmit/);
  assert.match(fields, /SourcePluginProjectCapabilityPicker/);
  assert.doesNotMatch(fields, /<Panel/);
  assert.match(legacyForm, /CreateSourcePluginProjectFields/);
  assert.match(installForm, /surface\s*=\s*['"]panel['"]/);
  assert.match(installForm, /surface === ['"]panel['"]/);
});

test('Studio dashboard uses a project table and modal-triggered creation and install flows', async () => {
  const [studio, dashboard, table, createModal, installModal, page] = await Promise.all([
    readFile('apps/web/src/widgets/source-plugin-studio/ui/SourcePluginStudio.tsx', 'utf8'),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/dashboard/PluginStudioDashboard.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/dashboard/PluginStudioProjectTable.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/dashboard/CreateSourcePluginProjectModal.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/dashboard/InstallSourcePluginModal.tsx',
      'utf8'
    ),
    readFile('apps/web/src/pages/source-plugin-studio/ui/SourcePluginStudioPage.tsx', 'utf8')
  ]);

  assert.match(studio, /PluginStudioDashboard/);
  assert.match(studio, /PluginStudioWorkbench/);
  assert.match(dashboard, /PageHeader/);
  assert.match(dashboard, /PluginStudioProjectTable/);
  assert.match(table, /DataTable/);
  assert.match(table, /DataTableHeaderCell/);
  assert.match(createModal, /<Modal/);
  assert.match(createModal, /useCreateSourcePluginProjectDraft/);
  assert.match(createModal, /SegmentedControl/);
  assert.match(createModal, /ImportSourcePluginProjectForm/);
  assert.match(createModal, /create-blank/);
  assert.match(createModal, /import-project/);
  assert.match(installModal, /InstallSourcePluginForm/);
  assert.doesNotMatch(page, /InstallSourcePluginForm/);
});

test('Studio layout resolves mobile, tablet and activity-sidebar desktop modes', () => {
  assert.equal(resolvePluginStudioLayoutMode(640), 'mobile');
  assert.equal(resolvePluginStudioLayoutMode(900), 'tablet');
  assert.equal(resolvePluginStudioLayoutMode(1200), 'desktop');
});

test('Studio sidebar resizing clamps its width while preserving the editor minimum', () => {
  assert.equal(
    resizePluginStudioSidebar({
      containerWidth: 1200,
      sidebar: PLUGIN_STUDIO_LAYOUT.sidebarDefault,
      delta: -500
    }),
    PLUGIN_STUDIO_LAYOUT.sidebarMin
  );

  const expanded = resizePluginStudioSidebar({
    containerWidth: 1200,
    sidebar: PLUGIN_STUDIO_LAYOUT.sidebarDefault,
    delta: 1000
  });
  assert.ok(
    1200 - PLUGIN_STUDIO_LAYOUT.activityBarWidth - expanded - PLUGIN_STUDIO_LAYOUT.handle >=
      PLUGIN_STUDIO_LAYOUT.centerMin
  );
});

test('Studio resize handle exposes pointer and keyboard separator behavior', async () => {
  const source = await readFile(
    'apps/web/src/widgets/source-plugin-studio/ui/workbench/PluginStudioSidebarResizeHandle.tsx',
    'utf8'
  );
  assert.match(source, /role="separator"/);
  assert.match(source, /aria-orientation="vertical"/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /setPointerCapture/);
});

test('Studio workspace exposes desktop activity sidebar and responsive panel regions', async () => {
  const [workbench, shell, activityBar, toolbar] = await Promise.all([
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/PluginStudioWorkbench.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/PluginStudioWorkspace.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/PluginStudioActivityBar.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/PluginStudioToolbar.tsx',
      'utf8'
    )
  ]);
  assert.match(workbench, /PluginStudioWorkspace/);
  assert.match(activityBar, /data-studio-activity-bar/);
  assert.match(shell, /data-studio-region="sidebar"/);
  assert.match(shell, /data-studio-region="files"/);
  assert.match(shell, /data-studio-region="editor"/);
  assert.match(shell, /data-studio-region="inspector"/);
  assert.match(toolbar, /pluginStudio\.backToProjects/);
  assert.match(toolbar, /diagnosticSummary/);
});

test('Studio editor pane keeps Monaco dominant and output collapsible', async () => {
  const source = await readFile(
    'apps/web/src/widgets/source-plugin-studio/ui/workbench/editor/PluginStudioEditorPane.tsx',
    'utf8'
  );
  assert.match(source, /PluginCodeEditor/);
  assert.match(source, /PluginStudioOutput/);
  assert.match(source, /outputOpen/);
  assert.match(source, /activeAction/);
});

test('Studio responsive navigation selects Files, Editor or Details without vertical stacking', async () => {
  const [nav, shell] = await Promise.all([
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/PluginStudioMobilePanelNav.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/PluginStudioWorkspace.tsx',
      'utf8'
    )
  ]);
  assert.match(nav, /files/);
  assert.match(nav, /editor/);
  assert.match(nav, /details/);
  assert.match(nav, /aria-selected/);
  assert.match(shell, /mode === 'mobile'/);
  assert.match(shell, /mode === 'tablet'/);
  assert.match(shell, /mode === 'desktop'/);
  assert.match(shell, /hidden=\{activePanel !== 'files'\}/);
  assert.match(shell, /hidden=\{activePanel !== 'editor'\}/);
  assert.match(shell, /hidden=\{activePanel !== 'details'\}/);
  assert.doesNotMatch(shell, /grid-cols-1[\s\S]*sidebar[\s\S]*editor[\s\S]*inspector/);
});

test('Studio modals preserve the shared mobile BottomSheet surface', async () => {
  const sources = await Promise.all(
    ['CreateSourcePluginProjectModal.tsx', 'InstallSourcePluginModal.tsx'].map((file) =>
      readFile(`apps/web/src/widgets/source-plugin-studio/ui/dashboard/${file}`, 'utf8')
    )
  );
  for (const source of sources) {
    assert.doesNotMatch(source, /h-\[calc\(100dvh/);
    assert.doesNotMatch(source, /rounded-none/);
    assert.match(source, /md:\[--modal-width:/);
  }
});

test('Studio editor supplies a clipboard service without Monaco WebKit workaround logging', async () => {
  const [editor, clipboard] = await Promise.all([
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/editor/PluginCodeEditor.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/model/source-plugin-studio-clipboard.ts',
      'utf8'
    )
  ]);

  assert.match(editor, /overrideServices/);
  assert.match(editor, /sourcePluginStudioClipboardService/);
  assert.match(clipboard, /writeText/);
  assert.match(clipboard, /readText/);
  assert.match(clipboard, /clearInternalState/);

  const { createSourcePluginStudioClipboardService } =
    await import('../../apps/web/src/widgets/source-plugin-studio/model/source-plugin-studio-clipboard.ts');
  const service = createSourcePluginStudioClipboardService({
    clipboard: {
      writeText: async () => {
        throw new Error('Canceled');
      },
      readText: async () => {
        throw new Error('NotAllowed');
      }
    }
  });

  await assert.doesNotReject(() => service.writeText('plugin source'));
  assert.equal(await service.readText(), '');
});

test('Studio desktop activity sidebar toggles without resizing the editor column', async () => {
  const [shell, workbench, activityBar, sidebar, inspector] = await Promise.all([
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/PluginStudioWorkspace.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/PluginStudioWorkbench.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/PluginStudioActivityBar.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/PluginStudioExplorer.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/inspector/PluginStudioInspector.tsx',
      'utf8'
    )
  ]);

  assert.match(shell, /PluginStudioActivityBar/);
  assert.match(shell, /data-studio-region="sidebar"/);
  assert.doesNotMatch(workbench, /sidebarOpen/);
  assert.match(shell, /sidebarOpen/);
  assert.match(shell, /position: 'absolute'/);
  assert.match(shell, /hidden=\{!sidebarOpen\}/);
  assert.doesNotMatch(workbench, /activityPanel/);
  assert.match(shell, /activityPanel/);
  assert.match(activityBar, /selected \? 'text-primary hover:text-primary'/);
  assert.doesNotMatch(activityBar, /bg-primary-subtle/);
  assert.doesNotMatch(activityBar, /inset-y-2 left-0/);
  assert.doesNotMatch(workbench, /filesCollapsed|inspectorCollapsed/);
  assert.doesNotMatch(sidebar, /onCollapse|PanelLeftClose|PluginProjectFileTree/);
  assert.doesNotMatch(inspector, /onCollapse|PanelRightClose/);
});

test('Studio output is an editor-local dock with copy, clear and resize controls', async () => {
  const [pane, output] = await Promise.all([
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/editor/PluginStudioEditorPane.tsx',
      'utf8'
    ),
    readFile(
      'apps/web/src/widgets/source-plugin-studio/ui/workbench/editor/PluginStudioOutput.tsx',
      'utf8'
    )
  ]);

  assert.match(pane, /data-studio-output-dock/);
  assert.match(pane, /gridTemplateRows/);
  assert.doesNotMatch(pane, /maxHeight/);
  assert.match(output, /data-studio-output-content/);
  assert.match(pane, /PluginStudioOutputResizeHandle/);
  assert.match(output, /Copy/);
  assert.match(output, /Clear/);
  assert.match(pane, /role="separator"/);
});
