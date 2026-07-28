export type PluginStudioLayoutMode = 'mobile' | 'tablet' | 'desktop';
export type PluginStudioPanel = 'files' | 'editor' | 'details';
export type PluginStudioInspectorTab = 'metadata' | 'diagnostics';
export type PluginStudioActivityPanel = 'files' | PluginStudioInspectorTab;

export const PLUGIN_STUDIO_LAYOUT = {
  activityBarWidth: 44,
  sidebarDefault: 288,
  sidebarMin: 224,
  sidebarMax: 480,
  centerMin: 448,
  desktopMin: 1024,
  handle: 8,
  keyboardStep: 16
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

export function resolvePluginStudioLayoutMode(containerWidth: number): PluginStudioLayoutMode {
  if (containerWidth < 768) return 'mobile';
  return containerWidth >= PLUGIN_STUDIO_LAYOUT.desktopMin ? 'desktop' : 'tablet';
}

export function resizePluginStudioSidebar({
  containerWidth,
  sidebar,
  delta
}: {
  containerWidth: number;
  sidebar: number;
  delta: number;
}): number {
  const available =
    containerWidth -
    PLUGIN_STUDIO_LAYOUT.activityBarWidth -
    PLUGIN_STUDIO_LAYOUT.handle -
    PLUGIN_STUDIO_LAYOUT.centerMin;
  return clamp(
    sidebar + delta,
    PLUGIN_STUDIO_LAYOUT.sidebarMin,
    Math.min(PLUGIN_STUDIO_LAYOUT.sidebarMax, Math.max(PLUGIN_STUDIO_LAYOUT.sidebarMin, available))
  );
}
