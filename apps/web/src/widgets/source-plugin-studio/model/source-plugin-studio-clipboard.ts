type ClipboardPort = {
  writeText: (text: string) => Promise<void>;
  readText: () => Promise<string>;
};

type ClipboardDocument = Pick<Document, 'activeElement' | 'body' | 'createElement' | 'execCommand'>;

export type SourcePluginStudioClipboardEnvironment = {
  clipboard?: ClipboardPort;
  document?: ClipboardDocument;
};

function fallbackWriteText(document: ClipboardDocument | undefined, text: string) {
  if (!document?.body) return;

  const activeElement = document.activeElement;
  const textArea = document.createElement('textarea');
  textArea.setAttribute('aria-hidden', 'true');
  textArea.style.height = '1px';
  textArea.style.width = '1px';
  textArea.style.position = 'absolute';
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand('copy');
  textArea.remove();

  if (activeElement instanceof HTMLElement) activeElement.focus();
}

export function createSourcePluginStudioClipboardService({
  clipboard,
  document
}: SourcePluginStudioClipboardEnvironment = {}) {
  const typedText = new Map<string, string>();
  let findText = '';

  return {
    async writeText(text: string, type?: string) {
      if (type) {
        typedText.set(type, text);
        return;
      }

      try {
        if (!clipboard) throw new Error('Clipboard API unavailable');
        await clipboard.writeText(text);
      } catch {
        fallbackWriteText(document, text);
      }
    },
    async readText(type?: string) {
      if (type) return typedText.get(type) ?? '';

      try {
        return clipboard ? await clipboard.readText() : '';
      } catch {
        return '';
      }
    },
    async readFindText() {
      return findText;
    },
    async writeFindText(text: string) {
      findText = text;
    },
    async readResources() {
      return [];
    },
    clearInternalState() {
      typedText.clear();
    }
  };
}

export const sourcePluginStudioClipboardService = createSourcePluginStudioClipboardService({
  clipboard: typeof navigator === 'undefined' ? undefined : navigator.clipboard,
  document: typeof window === 'undefined' ? undefined : window.document
});
