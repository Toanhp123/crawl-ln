export async function readClipboardText(
  clipboard: Pick<Clipboard, 'readText'> = navigator.clipboard
): Promise<string> {
  return (await clipboard.readText()).trim();
}
