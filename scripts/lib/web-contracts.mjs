import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

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

export async function checkWebContracts(webRoot, projectRoot = process.cwd()) {
  const absoluteWebRoot = path.resolve(projectRoot, webRoot);
  const violations = [];
  const sources = [];

  for (const file of await walk(absoluteWebRoot)) {
    const source = await readFile(file, 'utf8');
    const relative = path.relative(projectRoot, file).replaceAll('\\', '/');
    sources.push(source);

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

  const source = sources.join('\n');
  if (source.includes('/api/' + 'plugins'))
    violations.push(`${webRoot}: retains removed plugin endpoint`);
  if (!source.includes('/source-reader/plugins')) {
    violations.push(`${webRoot}: Sources UI does not use Source Reader plugin endpoint`);
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
    if (!source.includes(endpoint)) {
      violations.push(`${webRoot}: Source Reader web console does not reference ${endpoint}`);
    }
  }

  const buildConfig = await readFile(path.join(absoluteWebRoot, 'shared/config/build.ts'), 'utf8');
  if (!buildConfig.includes('__APP_VERSION__')) {
    violations.push(
      `${webRoot}/shared/config/build.ts: version must come from Vite package metadata`
    );
  }
  if (!buildConfig.includes('__APP_BUILD__')) {
    violations.push(`${webRoot}/shared/config/build.ts: build metadata must come from Vite define`);
  }

  return violations;
}
