import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Surface } from '../../../../shared/ui';
import type { SourcePluginStudioDiagnosticSummary } from '../../model/source-plugin-studio-diagnostics';
import {
  PLUGIN_STUDIO_LAYOUT,
  resolvePluginStudioLayoutMode,
  resizePluginStudioSidebar,
  type PluginStudioActivityPanel,
  type PluginStudioPanel
} from '../../model/source-plugin-studio-layout';
import { PluginStudioActivityBar } from './PluginStudioActivityBar';
import { PluginStudioMobilePanelNav } from './PluginStudioMobilePanelNav';
import { PluginStudioSidebarResizeHandle } from './PluginStudioSidebarResizeHandle';

export function PluginStudioWorkspace({
  activePanel,
  onActivePanelChange,
  diagnosticSummary,
  toolbar,
  notice,
  filesSidebar,
  metadataSidebar,
  diagnosticsSidebar,
  editor,
  inspector,
  activityBarLabel,
  activityLabels,
  resizeSidebarLabel
}: {
  activePanel: PluginStudioPanel;
  onActivePanelChange: (panel: PluginStudioPanel) => void;
  diagnosticSummary: SourcePluginStudioDiagnosticSummary;
  toolbar: ReactNode;
  notice?: ReactNode;
  filesSidebar: ReactNode;
  metadataSidebar: ReactNode;
  diagnosticsSidebar: ReactNode;
  editor: ReactNode;
  inspector: ReactNode;
  activityBarLabel: string;
  activityLabels: Record<PluginStudioActivityPanel, string>;
  resizeSidebarLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const desktopSidebarRef = useRef<HTMLElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [activityPanel, setActivityPanel] = useState<PluginStudioActivityPanel>('files');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(PLUGIN_STUDIO_LAYOUT.sidebarDefault);
  const mode = resolvePluginStudioLayoutMode(containerWidth);

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
    const adjusted = resizePluginStudioSidebar({
      containerWidth,
      sidebar: sidebarWidth,
      delta: 0
    });
    if (adjusted !== sidebarWidth) setSidebarWidth(adjusted);
  }, [containerWidth, mode, sidebarWidth]);

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

  const selectActivityPanel = (panel: PluginStudioActivityPanel) => {
    if (sidebarOpen && panel === activityPanel) {
      setSidebarOpen(false);
    } else {
      setActivityPanel(panel);
      setSidebarOpen(true);
    }
    window.requestAnimationFrame(() => desktopSidebarRef.current?.focus({ preventScroll: true }));
  };

  const filesRegion = (
    <section
      ref={filesRef}
      id="studio-files-panel"
      role="tabpanel"
      aria-labelledby="studio-files-tab"
      data-studio-region="files"
      tabIndex={-1}
      className="h-full min-h-0 min-w-0 overflow-hidden bg-surface2"
      onFocusCapture={() => onActivePanelChange('files')}
    >
      {filesSidebar}
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
      onFocusCapture={() => {
        if (mode !== 'desktop') onActivePanelChange('editor');
      }}
    >
      {editor}
    </section>
  );

  const inspectorRegion = (
    <aside
      ref={inspectorRef}
      id="studio-details-panel"
      role="tabpanel"
      aria-labelledby="studio-details-tab"
      data-studio-region="inspector"
      tabIndex={-1}
      className="h-full min-h-0 min-w-0 overflow-hidden border-l border-border bg-surface2"
      onFocusCapture={() => onActivePanelChange('details')}
    >
      {inspector}
    </aside>
  );

  return (
    <div ref={containerRef} className="min-w-0" data-studio-layout-mode={mode}>
      <Surface className="flex h-[calc(100svh-var(--height-header)-var(--app-nav-total))] min-h-0 min-w-0 flex-col overflow-hidden shadow-[var(--elevation-2)] md:h-[calc(100svh-var(--page-y)-var(--page-y))] md:min-h-[36rem]">
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
          <div className="relative grid min-h-0 flex-1 grid-cols-[44px_minmax(0,1fr)] overflow-hidden">
            <PluginStudioActivityBar
              activePanel={sidebarOpen ? activityPanel : null}
              onChange={selectActivityPanel}
              diagnosticSummary={diagnosticSummary}
              label={activityBarLabel}
              labels={activityLabels}
            />
            {editorRegion}
            <aside
              ref={desktopSidebarRef}
              data-studio-region="sidebar"
              data-studio-sidebar-panel={activityPanel}
              hidden={!sidebarOpen}
              tabIndex={-1}
              className="z-20 h-full min-h-0 min-w-0 overflow-hidden border-r border-border bg-surface2 shadow-[var(--elevation-2)]"
              style={{
                position: 'absolute',
                insetBlock: 0,
                left: PLUGIN_STUDIO_LAYOUT.activityBarWidth,
                width: sidebarWidth
              }}
            >
              <div
                id="studio-activity-files-panel"
                role="tabpanel"
                aria-labelledby="studio-activity-files-tab"
                className="h-full"
                hidden={activityPanel !== 'files'}
              >
                {filesSidebar}
              </div>
              <div
                id="studio-activity-metadata-panel"
                role="tabpanel"
                aria-labelledby="studio-activity-metadata-tab"
                className="h-full"
                hidden={activityPanel !== 'metadata'}
              >
                {metadataSidebar}
              </div>
              <div
                id="studio-activity-diagnostics-panel"
                role="tabpanel"
                aria-labelledby="studio-activity-diagnostics-tab"
                className="h-full"
                hidden={activityPanel !== 'diagnostics'}
              >
                {diagnosticsSidebar}
              </div>
            </aside>
            <div
              hidden={!sidebarOpen}
              className="absolute inset-y-0 z-30"
              style={{ left: PLUGIN_STUDIO_LAYOUT.activityBarWidth + sidebarWidth - 4 }}
            >
              <PluginStudioSidebarResizeHandle
                label={resizeSidebarLabel}
                edge="left"
                onResize={(delta) =>
                  setSidebarWidth((current) =>
                    resizePluginStudioSidebar({
                      containerWidth,
                      sidebar: current,
                      delta
                    })
                  )
                }
              />
            </div>
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
