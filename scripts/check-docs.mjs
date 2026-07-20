import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FORBIDDEN_DIRECTORIES = ['docs/superpowers', 'docs/archive', 'docs/changelog'];
const RETIRED_PATTERNS = [
  /\bsource[-_ ]profiles?\b/i,
  /\bSOURCE_PROFILES_FILE\b/,
  /\bsource-profiles\.json\b/i
];
const LINK_ENTRYPOINTS = ['README.md', 'docs/README.md'];
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules']);

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function collectMarkdown(root, current, files) {
  if (!(await exists(current))) return;
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdown(root, absolute, files);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(relative(root, absolute).replaceAll('\\', '/'));
    }
  }
}

function localMarkdownLinks(markdown) {
  const links = [];
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(pattern)) {
    let target = match[1].trim();
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    const titleSeparator = target.match(/\s+["']/);
    if (titleSeparator?.index !== undefined) target = target.slice(0, titleSeparator.index);
    if (!target || target.startsWith('#')) continue;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
    links.push(decodeURIComponent(target.split('#', 1)[0]));
  }
  return links;
}

export async function checkDocumentation(projectRoot = process.cwd()) {
  const root = resolve(projectRoot);
  const errors = [];

  for (const directory of FORBIDDEN_DIRECTORIES) {
    if (await exists(join(root, directory))) {
      errors.push(`Historical documentation directory must be absent: ${directory}`);
    }
  }

  for (const entrypoint of LINK_ENTRYPOINTS) {
    const absolute = join(root, entrypoint);
    if (!(await exists(absolute))) {
      errors.push(`Missing canonical documentation entrypoint: ${entrypoint}`);
      continue;
    }
    const content = await readFile(absolute, 'utf8');
    for (const link of localMarkdownLinks(content)) {
      const target = resolve(dirname(absolute), link);
      if (!(await exists(target))) {
        errors.push(`Broken Markdown link in ${entrypoint}: ${link}`);
      }
    }
  }

  const markdownFiles = [];
  await collectMarkdown(root, root, markdownFiles);
  const hashes = new Map();

  for (const path of markdownFiles.sort()) {
    const content = await readFile(join(root, path), 'utf8');
    const isHistoricalChangelog = path === 'CHANGELOG.md';
    if (!isHistoricalChangelog && RETIRED_PATTERNS.some((pattern) => pattern.test(content))) {
      errors.push(`Current documentation uses retired source-profile terminology: ${path}`);
    }

    const normalized = content.replaceAll('\r\n', '\n').trim();
    if (normalized.length < 64) continue;
    const hash = createHash('sha256').update(normalized).digest('hex');
    const matches = hashes.get(hash) ?? [];
    matches.push(path);
    hashes.set(hash, matches);
  }

  for (const matches of hashes.values()) {
    if (matches.length > 1) {
      errors.push(`Found duplicate Markdown content: ${matches.join(', ')}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

async function main() {
  const result = await checkDocumentation();
  if (result.ok) {
    console.log('Documentation links, terminology, history boundaries, and duplicates are clean.');
    return;
  }
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
