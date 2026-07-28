import { Database, Files, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconButton, Surface } from '../../../shared/ui';
import type { SourcePluginStudioDiagnosticSummary } from '../model/source-plugin-studio-diagnostics';
import {
  PLUGIN_STUDIO_LAYOUT,
  resolvePluginStudioLayoutMode,
  resizePluginStudioColumns,
  type PluginStudioPanel
} from '../model/source-plugin-studio-layout';
import { PluginStudioMobilePanelNav } from './PluginStudioMobilePanelNav';
import { PluginStudioPanelRail } from './PluginStudioPanelRail';
import { PluginStudioResizeHandle } from './PluginStudioResizeHandle';

export function PluginStudioWorkspaceShell({
  activePanel,
  onActivePanelChange,
  diagnosticSummary,
  toolbar,
  notice,
  sidebar,
  editor,
  inspector,
  filesCollapsed,
  inspectorCollapsed,
  filesRailLabel,
  metadataRailLabel,
  diagnosticsRailLabel,
  onExpandFiles,
  onExpandMetadata,
  onExpandDiagnostics,
  resizeFilesLabel,
  resizeInspectorLabel
}: {
  activePanel: PluginStudioPanel;
  onActivePanelChange: (panel: PluginStudioPanel) => void;
  diagnosticSummary: SourcePluginStudioDiagnosticSummary;
  toolbar: ReactNode;
  notice?: ReactNode;
  sidebar: ReactNode;
  editor: ReactNode;
  inspector: ReactNode;
  filesCollapsed: boolean;
  inspectorCollapsed: boolean;
  filesRailLabel: string;
  metadataRailLabel: string;
  diagnosticsRailLabel: string;
  onExpandFiles: () => void;
  onExpandMetadata: () => void;
  onExpandDiagnostics: () => void;
  resizeFilesLabel: string;
  resizeInspectorLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [leftWidth, setLeftWidth] = useState<number>(PLUGIN_STUDIO_LAYOUT.leftDefault);
  const [rightWidth, setRightWidth] = useState<number>(PLUGIN_STUDIO_LAYOUT.rightDefault);
  const mode = resolvePluginStudioLayoutMode(containerWidth);
  const desktopFilesCollapsed = mode === 'desktop' && filesCollapsed;
  const desktopInspectorCollapsed = mode === 'desktop' && inspectorCollapsed;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const updateWidth = () => setContainerWidth(container.getBoundingClientRect().width);
    const observer = new ResizeObserver(updateWidth);
    updateWidth();
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (mode !== 'desktop') return;
    const leftAdjusted = resizePluginStudioColumns({
      containerWidth,
      left: leftWidth,
      right: rightWidth,
      edge: 'left',
      delta: 0
    });
    const adjusted = resizePluginStudioColumns({
      containerWidth,
      left: leftAdjusted.left,
      right: leftAdjusted.right,
      edge: 'right',
      delta: 0
    });
    if (adjusted.left !== leftWidth) setLeftWidth(adjusted.left);
    if (adjusted.right !== rightWidth) setRightWidth(adjusted.right);
  }, [containerWidth, leftWidth, mode, rightWidth]);

  const resize = (edge: 'left' | 'right', delta: number) => {
    if (mode !== 'desktop') return;
    const next = resizePluginStudioColumns({
      containerWidth,
      left: leftWidth,
      right: rightWidth,
      edge,
      delta
    });
    setLeftWidth(next.left);
    setRightWidth(next.right);
  };

  const selectPanel = (panel: PluginStudioPanel) => {
    onActivePanelChange(panel);
    window.requestAnimationFrame(() => {
      const target =
        panel === 'files'
          ? filesRef.current
          : panel === 'details'
            ? inspectorRef.current
            : editorRef.current;
      target?.focus({ preventScroll: true });
    });
  };

  const filesRegion = (
    <section
      ref={filesRef}
      id="studio-files-panel"
      role={mode === 'desktop' ? undefined : 'tabpanel'}
      aria-labelledby={mode === 'desktop' ? undefined : 'studio-files-tab'}
      data-studio-region="files"
      data-collapsed={desktopFilesCollapsed || undefined}
      tabIndex={mode === 'desktop' ? undefined : -1}
      className="h-full min-h-0 min-w-0 overflow-hidden bg-surface2"
      onFocusCapture={() => onActivePanelChange('files')}
    >
      <div className="h-full" hidden={desktopFilesCollapsed}>
        {sidebar}
      </div>
      <div className="h-full" hidden={!desktopFilesCollapsed}>
        <PluginStudioPanelRail side="left" label={filesRailLabel}>
          <IconButton
            variant="ghost"
            aria-label={filesRailLabel}
            title={filesRailLabel}
            onClick={onExpandFiles}
          >
            <Files size={18} aria-hidden="true" />
          </IconButton>
        </PluginStudioPanelRail>
      </div>
    </section>
  );

  const editorRegion = (
    <section
      ref={editorRef}
      id="studio-editor-panel"
      role={mode === 'desktop' ? undefined : 'tabpanel'}
      aria-labelledby={mode === 'desktop' ? undefined : 'studio-editor-tab'}
      data-studio-region="editor"
      tabIndex={mode === 'desktop' ? undefined : -1}
      className="h-full min-h-0 min-w-0 overflow-hidden bg-surface"
      onFocusCapture={() => onActivePanelChange('editor')}
    >
      {editor}
    </section>
  );

  const inspectorRegion = (
    <aside
      ref={inspectorRef}
      id="studio-details-panel"
      role={mode === 'desktop' ? undefined : 'tabpanel'}
      aria-labelledby={mode === 'desktop' ? undefined : 'studio-details-tab'}
      data-studio-region="inspector"
      data-collapsed={desktopInspectorCollapsed || undefined}
      tabIndex={mode === 'desktop' ? undefined : -1}
      className="h-full min-h-0 min-w-0 overflow-hidden border-l border-border bg-surface2"
      onFocusCapture={() => onActivePanelChange('details')}
    >
      <div className="h-full" hidden={desktopInspectorCollapsed}>
        {inspector}
      </div>
      <div className="h-full" hidden={!desktopInspectorCollapsed}>
        <PluginStudioPanelRail side="right" label={metadataRailLabel}>
          <IconButton
            variant="ghost"
            aria-label={metadataRailLabel}
            title={metadataRailLabel}
            onClick={onExpandMetadata}
          >
            <Database size={18} aria-hidden="true" />
          </IconButton>
          <div className="relative">
            <IconButton
              variant="ghost"
              aria-label={diagnosticsRailLabel}
              title={diagnosticsRailLabel}
              onClick={onExpandDiagnostics}
            >
              <TriangleAlert size={18} aria-hidden="true" />
            </IconButton>
            {diagnosticSummary.total > 0 ? (
              <span className="pointer-events-none absolute right-0 top-0 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
                {diagnosticSummary.total}
              </span>
            ) : null}
          </div>
        </PluginStudioPanelRail>
      </div>
    </aside>
  );

  return (
    <div ref={containerRef} className="min-w-0" data-studio-layout-mode={mode}>
      <Surface className="flex h-[calc(100svh-var(--height-header)-var(--app-nav-total))] min-h-[32rem] min-w-0 flex-col overflow-hidden shadow-[var(--elevation-2)] md:h-[calc(100svh-var(--page-y)-var(--page-y))] md:min-h-[36rem]">
        {toolbar}
        {notice}
        {mode !== 'desktop' ? (
          <PluginStudioMobilePanelNav
            activePanel={activePanel}
            onChange={selectPanel}
            diagnosticSummary={diagnosticSummary}
          />
        ) : null}

        {mode === 'desktop' ? (
          <div
            className="grid min-h-0 flex-1"
            style={{
              gridTemplateColumns: `${desktopFilesCollapsed ? PLUGIN_STUDIO_LAYOUT.railWidth : leftWidth}px ${desktopFilesCollapsed ? 0 : PLUGIN_STUDIO_LAYOUT.handle}px minmax(28rem, 1fr) ${desktopInspectorCollapsed ? 0 : PLUGIN_STUDIO_LAYOUT.handle}px ${desktopInspectorCollapsed ? PLUGIN_STUDIO_LAYOUT.railWidth : rightWidth}px`
            }}
          >
            {filesRegion}
            {desktopFilesCollapsed ? (
              <div aria-hidden="true" />
            ) : (
              <PluginStudioResizeHandle
                label={resizeFilesLabel}
                edge="left"
                onResize={(delta) => resize('left', delta)}
              />
            )}
            {editorRegion}
            {desktopInspectorCollapsed ? (
              <div aria-hidden="true" />
            ) : (
              <PluginStudioResizeHandle
                label={resizeInspectorLabel}
                edge="right"
                onResize={(delta) => resize('right', delta)}
              />
            )}
            {inspectorRegion}
          </div>
        ) : mode === 'tablet' ? (
          <div
            className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] overflow-hidden"
            data-studio-active-panel={activePanel}
          >
            {filesRegion}
            <div className="min-h-0 min-w-0 overflow-hidden border-l border-border">
              <div className="h-full" hidden={activePanel === 'details'}>
                {editorRegion}
              </div>
              <div className="h-full" hidden={activePanel !== 'details'}>
                {inspectorRegion}
              </div>
            </div>
          </div>
        ) : mode === 'mobile' ? (
          <div
            className="min-h-0 min-w-0 flex-1 overflow-hidden"
            data-studio-active-panel={activePanel}
          >
            <div className="h-full" hidden={activePanel !== 'files'}>
              {filesRegion}
            </div>
            <div className="h-full" hidden={activePanel !== 'editor'}>
              {editorRegion}
            </div>
            <div className="h-full" hidden={activePanel !== 'details'}>
              {inspectorRegion}
            </div>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}
