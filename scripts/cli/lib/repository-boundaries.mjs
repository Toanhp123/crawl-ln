import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';

export const PUBLIC_COMMANDS = [
  'setup',
  'dev',
  'build',
  'start',
  'check',
  'test',
  'format',
  'clean'
];

const transitionVersion = ['v', '3'].join('');
const transitionTokens = [
  ['api', 'next'].join('-'),
  ['web', 'next'].join('-'),
  ['api', 'legacy'].join('-'),
  ['web', 'legacy'].join('-'),
  ['v', '22'].join(''),
  ['vpn', 'gateway'].join('-'),
  ['novel tool', transitionVersion].join(' '),
  ['migrate', transitionVersion].join(':'),
  ['cutover', transitionVersion].join(':'),
  ['rollback', transitionVersion].join(':'),
  ['rehearse', transitionVersion].join(':'),
  ['verify', transitionVersion].join(':')
];
const shellExtensions = new Set([`.${['s', 'h'].join('')}`, `.${['ba', 'sh'].join('')}`]);
const physicalExecutables = [
  ['node_modules', 'vite'].join('/'),
  ['node_modules', 'typescript'].join('/'),
  ['node_modules', 'tsc'].join('/')
];
const preparePrefix = ['prepare', ''].join(':');
const preparedSuffix = ['', 'prepared'].join(':');
const preparePattern = new RegExp(`npm\\s+run\\s+${preparePrefix}[a-z0-9_-]+\\b`, 'i');
const preparedPattern = new RegExp(`npm\\s+run\\s+[a-z0-9_-]+${preparedSuffix}\\b`, 'i');
const sourceExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.sh',
  '.bash',
  '.ts',
  '.tsx',
  '.yml',
  '.yaml'
]);
const moduleExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const skippedDirectories = new Set(['.artifacts', '.git', 'dist', 'node_modules']);
const moduleSpecifierPattern =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'";()]*?\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const builtInNovelCoolPath = 'infrastructure/plugins/built-in/novelcool';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function collectFiles(root, current, files) {
  if (!(await exists(current))) return;
  const metadata = await stat(current);
  if (metadata.isFile()) {
    files.push(current);
    return;
  }
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) await collectFiles(root, absolute, files);
    else if (entry.isFile() && sourceExtensions.has(extname(entry.name).toLowerCase()))
      files.push(absolute);
  }
}

function runtimeRoots(root) {
  return [
    join(root, 'apps'),
    join(root, 'packages'),
    join(root, 'plugins'),
    join(root, 'scripts', 'cli'),
    join(root, 'scripts', 'lib'),
    join(root, 'tests')
  ];
}

function moduleSpecifiers(content) {
  return [...content.matchAll(moduleSpecifierPattern)].map((match) => match[1] ?? match[2]);
}

function pathIsWithin(parent, candidate) {
  const nested = relative(parent, candidate);
  return nested === '' || (!nested.startsWith('..') && !isAbsolute(nested));
}

function relativeImportResolvesWithin(importer, specifier, targetRoot) {
  return (
    specifier.startsWith('.') && pathIsWithin(targetRoot, resolve(dirname(importer), specifier))
  );
}

function pluginImportTargetsApplication(importer, specifier, appsRoot) {
  const normalized = specifier.replaceAll('\\', '/').toLowerCase();
  return (
    (!specifier.startsWith('.') &&
      (normalized === 'apps' || normalized.startsWith('apps/') || normalized.includes('/apps/'))) ||
    relativeImportResolvesWithin(importer, specifier, appsRoot)
  );
}

function applicationImportTargetsPlugin(importer, specifier, pluginsRoot) {
  const normalized = specifier.replaceAll('\\', '/').toLowerCase();
  return (
    (!specifier.startsWith('.') &&
      (normalized === 'plugins' ||
        normalized.startsWith('plugins/') ||
        normalized.includes('/plugins/'))) ||
    relativeImportResolvesWithin(importer, specifier, pluginsRoot)
  );
}

export async function checkFirstPartyPluginBoundaries(projectRoot) {
  const root = resolve(projectRoot);
  const appsRoot = join(root, 'apps');
  const pluginsRoot = join(root, 'plugins');
  const files = [];
  await collectFiles(root, appsRoot, files);
  await collectFiles(root, pluginsRoot, files);

  const errors = [];
  for (const absolute of [...new Set(files)].sort()) {
    if (!moduleExtensions.has(extname(absolute).toLowerCase())) continue;
    const display = relative(root, absolute).replaceAll('\\', '/');
    const normalizedDisplay = display.toLowerCase();
    const content = await readFile(absolute, 'utf8');
    const normalizedContent = content.replaceAll('\\', '/').toLowerCase();
    if (normalizedContent.includes(builtInNovelCoolPath)) {
      errors.push(`Built-in NovelCool reference is forbidden: ${display}`);
    }

    const specifiers = moduleSpecifiers(content);
    if (
      normalizedDisplay.startsWith('plugins/') &&
      specifiers.some((specifier) => pluginImportTargetsApplication(absolute, specifier, appsRoot))
    ) {
      errors.push(`First-party plugin imports application code: ${display}`);
    }
    if (
      normalizedDisplay.startsWith('apps/') &&
      specifiers.some((specifier) =>
        applicationImportTargetsPlugin(absolute, specifier, pluginsRoot)
      )
    ) {
      errors.push(`Application imports first-party plugin source: ${display}`);
    }
  }
  return [...new Set(errors)].sort();
}

function allRoots(root) {
  return [
    ...runtimeRoots(root),
    join(root, 'scripts'),
    join(root, 'package.json'),
    join(root, 'README.md'),
    join(root, 'docs'),
    join(root, '.github'),
    join(root, 'playwright.config.ts'),
    join(root, 'specs')
  ];
}

function excludedPath(relativePath, scope) {
  if (relativePath === 'CHANGELOG.md') return true;
  if (relativePath.startsWith('specs/') && relativePath.endsWith('.md')) return true;
  if (scope === 'runtime') {
    if (/^scripts\/[^/]+\.(?:mjs|sh|bash)$/i.test(relativePath)) return true;
    if (
      relativePath === 'tests/regression/project-command-graph.test.ts' ||
      relativePath === 'tests/regression/source-plugin-sdk-build-graph.test.ts'
    )
      return true;
    if (
      relativePath === 'package.json' ||
      relativePath.endsWith('/package.json') ||
      relativePath.startsWith('docs/') ||
      relativePath === 'README.md'
    )
      return true;
  }
  return false;
}

async function rootCommandErrors(root) {
  const errors = [];
  const manifestPath = join(root, 'package.json');
  if (!(await exists(manifestPath))) return ['Missing root package.json'];
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    return [`Invalid root package.json: ${error.message}`];
  }
  const scriptKeys = Object.keys(manifest.scripts ?? {});
  if (JSON.stringify(scriptKeys) !== JSON.stringify(PUBLIC_COMMANDS)) {
    errors.push(`Root script keys must be exactly: ${PUBLIC_COMMANDS.join(', ')}`);
  }
  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    if (name.startsWith(preparePrefix) || name.endsWith(preparedSuffix)) {
      errors.push(`Public prepared-state alias is forbidden: ${name}`);
    }
    const normalized = String(command).replaceAll('\\', '/').toLowerCase();
    for (const signature of physicalExecutables) {
      if (normalized.includes(signature))
        errors.push(`Physical dependency executable path in root script ${name}`);
    }
  }
  return errors;
}

export async function checkRepositoryBoundaries(projectRoot, { scope = 'all' } = {}) {
  const root = resolve(projectRoot);
  if (!['runtime', 'all'].includes(scope)) throw new Error(`Unknown boundary scope: ${scope}`);
  const errors = [];
  if (scope === 'all') errors.push(...(await rootCommandErrors(root)));
  errors.push(...(await checkFirstPartyPluginBoundaries(root)));

  const files = [];
  for (const candidate of scope === 'runtime' ? runtimeRoots(root) : allRoots(root)) {
    await collectFiles(root, candidate, files);
  }
  for (const absolute of [...new Set(files)].sort()) {
    const display = relative(root, absolute).replaceAll('\\', '/');
    if (excludedPath(display, scope)) continue;
    const normalizedPath = display.toLowerCase();
    if (
      normalizedPath.startsWith(`scripts/${transitionVersion}/`) ||
      (normalizedPath.startsWith('docs/') && normalizedPath.includes(transitionVersion)) ||
      (normalizedPath.startsWith('specs/') &&
        normalizedPath.includes(transitionVersion) &&
        !normalizedPath.endsWith('.md'))
    ) {
      errors.push(`Transition executable or schema is forbidden: ${display}`);
    }
    if (shellExtensions.has(extname(display).toLowerCase())) {
      errors.push(`Shell command entrypoint is forbidden: ${display}`);
      continue;
    }
    const content = await readFile(absolute, 'utf8');
    const normalized = content.replaceAll('\\', '/').toLowerCase();
    for (const token of transitionTokens) {
      if (normalized.includes(token))
        errors.push(`Transition terminology "${token}" in ${display}`);
    }
    for (const signature of physicalExecutables) {
      if (normalized.includes(signature))
        errors.push(`Physical dependency executable path in ${display}`);
    }
    if (preparePattern.test(content) || preparedPattern.test(content)) {
      errors.push(`Prepared-state command surface in ${display}`);
    }
  }
  return [...new Set(errors)].sort();
}
