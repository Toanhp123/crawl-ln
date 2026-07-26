export const NOVELCOOL_HOST = 'novelcool.com';
export const novelCoolMinimumChapterContentChars = 200;

export const NOVELCOOL_METADATA_TITLE_SELECTORS = ['h1.novel-title', 'h1', '.bookinfo h1'] as const;

export const NOVELCOOL_AUTHOR_SELECTORS = ['.author', '.bookinfo .author'] as const;
export const NOVELCOOL_COVER_SELECTORS = ['img.book-cover', '.bookinfo img', '.cover img'] as const;
export const NOVELCOOL_DESCRIPTION_SELECTORS = ['.summary', '.description', '#summary'] as const;
