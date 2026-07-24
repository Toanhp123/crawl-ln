import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.css', '.ts', '.tsx']);
const EXTERNAL_CUSTOM_PROPERTIES = new Set([
  '--radix-toast-swipe-end-x',
  '--radix-toast-swipe-move-x'
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(target);
  }
  return files;
}

function normalizeRelative(projectRoot, file) {
  return path.relative(projectRoot, file).replaceAll('\\', '/');
}

function findMatchingBrace(source, openingIndex) {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function collectDefinitionBlocks(source, relative, scopes = []) {
  const definitions = [];
  let cursor = 0;
  while (cursor < source.length) {
    const openingIndex = source.indexOf('{', cursor);
    if (openingIndex === -1) break;
    const closingIndex = findMatchingBrace(source, openingIndex);
    if (closingIndex === -1) break;
    const header = source.slice(cursor, openingIndex).trim().replace(/\s+/g, ' ');
    const body = source.slice(openingIndex + 1, closingIndex);
    if (header.startsWith('@')) {
      definitions.push(...collectDefinitionBlocks(body, relative, [...scopes, header]));
    } else if (header) {
      const selector = [...scopes, header].join(' > ');
      for (const match of body.matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;{}]+);/gi)) {
        definitions.push({ token: match[1], value: match[2].trim(), selector, relative });
      }
    }
    cursor = closingIndex + 1;
  }
  return definitions;
}

function collectDefinitions(source, relative) {
  return relative.endsWith('.css') ? collectDefinitionBlocks(source, relative) : [];
}
function collectUsages(source, relative) {
  return [...source.matchAll(/var\(\s*(--[a-z0-9_-]+)/gi)].map((match) => ({
    token: match[1],
    relative
  }));
}

export async function checkWebThemeContracts(webSourceRoot, projectRoot = process.cwd()) {
  const absoluteRoot = path.resolve(projectRoot, webSourceRoot);
  const definitions = [];
  const usages = [];

  for (const file of await walk(absoluteRoot)) {
    const relative = normalizeRelative(projectRoot, file);
    const source = await readFile(file, 'utf8');
    definitions.push(...collectDefinitions(source, relative));
    usages.push(...collectUsages(source, relative));
  }

  const definitionsByToken = new Map();
  for (const definition of definitions) {
    const values = definitionsByToken.get(definition.token) ?? [];
    values.push(definition);
    definitionsByToken.set(definition.token, values);
  }

  const violations = [];
  for (const usage of usages) {
    if (EXTERNAL_CUSTOM_PROPERTIES.has(usage.token)) continue;
    const owners = definitionsByToken.get(usage.token) ?? [];
    if (owners.length === 0) {
      violations.push(`${usage.relative}: ${usage.token} is used but not defined`);
      continue;
    }
    if (
      usage.relative.includes('/shared/ui/') &&
      !owners.some((owner) => owner.relative.includes('/shared/theme/'))
    ) {
      violations.push(
        `${usage.relative}: ${usage.token} is consumed by shared/ui but is not owned by shared/theme`
      );
    }
  }

  const sharedScopeValues = new Map();
  for (const definition of definitions.filter((item) => item.relative.includes('/shared/theme/'))) {
    const key = `${definition.selector}\u0000${definition.token}`;
    const existing = sharedScopeValues.get(key);
    if (existing && existing.value !== definition.value) {
      violations.push(
        `${definition.relative}: ${definition.token} has conflicting values in selector ${definition.selector}: ${existing.value} versus ${definition.value}`
      );
    } else if (!existing) {
      sharedScopeValues.set(key, definition);
    }
  }

  return [...new Set(violations)].sort();
}
