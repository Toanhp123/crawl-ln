export const NOVELCOOL_HOST = 'novelcool.com';
export const novelCoolMinimumChapterContentChars = 200;

export const NOVELCOOL_METADATA_TITLE_SELECTORS = ['h1.novel-title', 'h1', '.bookinfo h1'] as const;

export const NOVELCOOL_AUTHOR_SELECTORS = ['.author', '.bookinfo .author'] as const;
export const NOVELCOOL_COVER_SELECTORS = ['img.book-cover', '.bookinfo img', '.cover img'] as const;
export const NOVELCOOL_DESCRIPTION_SELECTORS = ['.summary', '.description', '#summary'] as const;
export const NOVELCOOL_CHAPTER_TITLE_SELECTORS = [
  'h1.chapter-title',
  '.chapter-title',
  'h1'
] as const;
export const NOVELCOOL_CONTENT_SELECTORS = [
  '.overflow-hidden:has(.chapter-start-mark)',
  '.chapter-content',
  '#chapter-content',
  '.reading-content'
] as const;
export const NOVELCOOL_CONTENT_REMOVE_SELECTOR =
  'script,style,noscript,nav,header,footer,aside,form,button,.ads,.advertisement';
