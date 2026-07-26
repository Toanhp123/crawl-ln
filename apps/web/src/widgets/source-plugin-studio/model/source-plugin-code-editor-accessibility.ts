export function sourcePluginCodeEditorAriaLabel(
  path: string,
  translate: (key: string, params?: { file: string }) => string
) {
  return translate('pluginStudio.editorAriaLabel', { file: path });
}
