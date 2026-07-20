import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'apps/web/src');
const violations = [];
const webSources = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(target);
  }
  return files;
}

for (const file of await walk(webRoot)) {
  const source = await readFile(file, 'utf8');
  const relative = path.relative(root, file).replaceAll('\\', '/');
  webSources.push(source);

  for (const match of source.matchAll(/http(?:Void)?<[^>]*>\(\s*([`'"])([^`'"]+)/g)) {
    const endpoint = match[2];
    if (!endpoint.startsWith('/api/')) {
      violations.push(`${relative}: API helper endpoint must start with /api/: ${endpoint}`);
    }
  }

  if (/payload\s+as\s+T/.test(source)) {
    violations.push(`${relative}: raw payload fallback bypasses the canonical API envelope`);
  }
  if (/'data'\s+in\s+envelope/.test(source)) {
    violations.push(`${relative}: legacy dual-envelope parsing is forbidden`);
  }
  if (/code\?\s*:\s*string/.test(source) && relative.includes('/shared/api/')) {
    violations.push(`${relative}: API error codes must use ApiErrorCode`);
  }
  if (/\/api\/novels\/[^\s'"`]*\/export|\/api\/novels\/crawl/.test(source)) {
    violations.push(`${relative}: legacy backend endpoint remains in frontend source`);
  }
}

const webSource = webSources.join('\n');
if (webSource.includes('/api/' + 'plugins')) {
  violations.push('web retains removed plugin endpoint');
}
if (!webSource.includes('/source-reader/plugins')) {
  violations.push('Sources UI does not use Source Reader plugin endpoint');
}

for (const endpoint of [
  '/source-reader/identify',
  '/source-reader/metadata',
  '/source-reader/chapter-list',
  '/source-reader/chapter-content',
  '/source-reader/search',
  '/source-reader/latest-updates',
  '/source-reader/plugins',
  '/source-reader/credentials',
  '/source-reader/network-profiles',
  '/source-reader/auth/challenges'
]) {
  if (!webSource.includes(endpoint)) {
    violations.push(`Source Reader web console does not reference ${endpoint}`);
  }
}

const buildConfig = await readFile(path.join(webRoot, 'shared/config/build.ts'), 'utf8');
if (!buildConfig.includes('__APP_VERSION__')) {
  violations.push(
    'apps/web/src/shared/config/build.ts: version must come from Vite package metadata'
  );
}

if (violations.length) {
  console.error('Frontend contract check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log('Frontend contract check passed.');
