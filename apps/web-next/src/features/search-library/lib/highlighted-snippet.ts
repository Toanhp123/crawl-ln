export interface HighlightedSnippetPart {
  text: string;
  highlighted: boolean;
}

export function splitHighlightedSnippet(value: string): HighlightedSnippetPart[] {
  const parts: HighlightedSnippetPart[] = [];
  let highlighted = false;
  for (const token of value.split(/(<mark>|<\/mark>)/gi)) {
    if (/^<mark>$/i.test(token)) {
      highlighted = true;
    } else if (/^<\/mark>$/i.test(token)) {
      highlighted = false;
    } else if (token) {
      parts.push({ text: token, highlighted });
    }
  }
  return parts;
}
