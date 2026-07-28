export type PluginStudioLayoutMode = 'mobile' | 'tablet' | 'desktop';
export type PluginStudioPanel = 'files' | 'editor' | 'details';
export type PluginStudioInspectorTab = 'metadata' | 'diagnostics';

export const PLUGIN_STUDIO_LAYOUT = {
  leftDefault: 256,
  leftMin: 208,
  rightDefault: 320,
  rightMin: 272,
  centerMin: 448,
  railWidth: 40,
  handle: 8,
  keyboardStep: 16
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

export function resolvePluginStudioLayoutMode(containerWidth: number): PluginStudioLayoutMode {
  if (containerWidth < 768) return 'mobile';
  const desktopMinimum =
    PLUGIN_STUDIO_LAYOUT.leftMin +
    PLUGIN_STUDIO_LAYOUT.centerMin +
    PLUGIN_STUDIO_LAYOUT.rightMin +
    PLUGIN_STUDIO_LAYOUT.handle * 2;
  return containerWidth >= desktopMinimum ? 'desktop' : 'tablet';
}

export function resizePluginStudioColumns({
  containerWidth,
  left,
  right,
  edge,
  delta
}: {
  containerWidth: number;
  left: number;
  right: number;
  edge: 'left' | 'right';
  delta: number;
}): { left: number; right: number } {
  const sideWidthAvailable =
    containerWidth - PLUGIN_STUDIO_LAYOUT.centerMin - PLUGIN_STUDIO_LAYOUT.handle * 2;

  if (edge === 'left') {
    const nextRight = clamp(
      right,
      PLUGIN_STUDIO_LAYOUT.rightMin,
      sideWidthAvailable - PLUGIN_STUDIO_LAYOUT.leftMin
    );
    const nextLeft = clamp(
      left + delta,
      PLUGIN_STUDIO_LAYOUT.leftMin,
      sideWidthAvailable - nextRight
    );
    return { left: nextLeft, right: nextRight };
  }

  const nextLeft = clamp(
    left,
    PLUGIN_STUDIO_LAYOUT.leftMin,
    sideWidthAvailable - PLUGIN_STUDIO_LAYOUT.rightMin
  );
  const nextRight = clamp(
    right - delta,
    PLUGIN_STUDIO_LAYOUT.rightMin,
    sideWidthAvailable - nextLeft
  );
  return { left: nextLeft, right: nextRight };
}
