import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const apiLegacyRole = ['api', 'legacy'].join('-');
const webLegacyRole = ['web', 'legacy'].join('-');
const legacyRoles = [apiLegacyRole, webLegacyRole];
const ignoredDirectories = new Set([
  '.artifacts',
  '.git',
  '.nyc_output',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results'
]);
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.sh',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml'
]);

export const retainedCoverageCapabilities = [
  'api-contract',
  'backend-architecture',
  'backup',
  'browser',
  'export',
  'frontend-architecture',
  'ingestion',
  'library',
  'migration',
  'reader-engine',
  'realtime',
  'scheduler',
  'search',
  'source-reader'
];

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function isInside(root, path) {
  const child = relative(resolve(root), resolve(path));
  return child === '' || (!child.startsWith('..') && !isAbsolute(child));
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function containsLegacyRole(source) {
  return legacyRoles.some((role) => source.includes(role));
}

function isLegacyRoot(path) {
  return legacyRoles.some((role) => path === `apps/${role}` || path.startsWith(`apps/${role}/`));
}

function isDocumentationPath(path) {
  return (
    path === 'README.md' ||
    path === 'CHANGELOG.md' ||
    path.startsWith('docs/') ||
    path.startsWith('specs/checkpoints/') ||
    path.startsWith('specs/plans/')
  );
}

function isDeferredPath(path) {
  return (
    isDocumentationPath(path) ||
    path === 'scripts/setup-termux.sh' ||
    path === 'scripts/termux-dev.sh'
  );
}

function rewritePathSet() {
  return new Set([
    '.gitignore',
    'package.json',
    'package-lock.json',
    'playwright.config.ts',
    'scripts/check-prepared.mjs',
    'scripts/run-test-files.mjs',
    'scripts/clean.mjs',
    'tests/regression/project-clean-command.test.ts'
  ]);
}

function fixedDeletePaths() {
  return [
    `apps/${apiLegacyRole}`,
    `apps/${webLegacyRole}`,
    'playwright.legacy.config.ts',
    `scripts/check-${apiLegacyRole}-architecture.mjs`,
    `scripts/check-${webLegacyRole}-architecture.mjs`,
    `scripts/check-${webLegacyRole}-contracts.mjs`,
    'scripts/check-crawler-platform.mjs',
    'scripts/v3/rename-workspaces.mjs',
    'scripts/v3/verify-canonical-candidate.mjs',
    'scripts/v3/workspace-cutover-map.mjs',
    'tests/e2e/web-next-semantic-parity.spec.ts',
    'tests/integration/v3-canonical-candidate.test.ts',
    'tests/regression/v3-workspace-rename.test.ts'
  ];
}

function shouldReadText(path) {
  const name = path.split('/').at(-1);
  return name === '.gitignore' || textExtensions.has(extname(name ?? '').toLowerCase());
}

async function collectTextFiles(root) {
  const files = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      const repositoryPath = normalizePath(relative(root, absolute));
      if (entry.isDirectory()) {
        if (!isLegacyRoot(repositoryPath)) await walk(absolute);
        continue;
      }
      if (entry.isFile() && shouldReadText(repositoryPath)) files.push(repositoryPath);
    }
  }

  await walk(root);
  return files.sort();
}

function extractImportSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

function resolveRepositoryImport(importer, specifier, fileSet) {
  if (!specifier.startsWith('.')) return undefined;
  const base = normalizePath(join(dirname(importer), specifier));
  const candidates = [base];
  const extension = extname(base);
  if (extension === '.js' || extension === '.mjs') {
    const stem = base.slice(0, -extension.length);
    candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.mjs`, `${stem}.js`);
  } else if (!extension) {
    candidates.push(
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.mjs`,
      `${base}.js`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
      `${base}/index.mjs`,
      `${base}/index.js`
    );
  }
  return candidates.map(normalizePath).find((candidate) => fileSet.has(candidate));
}

export async function validateCoverageMatrix(
  root = projectRoot,
  matrixPath = join(root, 'specs', 'v3-retained-test-coverage.json')
) {
  const resolvedRoot = resolve(root);
  const matrix = JSON.parse(await readFile(resolve(matrixPath), 'utf8'));
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
    throw new Error('Retained V3 coverage matrix must be an object');
  }
  const actual = Object.keys(matrix).sort();
  const expected = [...retainedCoverageCapabilities].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error('Retained V3 coverage matrix capabilities are incomplete');
  }

  for (const capability of retainedCoverageCapabilities) {
    const files = matrix[capability];
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error(`Retained V3 coverage is empty: ${capability}`);
    }
    for (const file of files) {
      if (typeof file !== 'string' || file.length === 0 || isAbsolute(file)) {
        throw new Error(`Retained V3 coverage path is invalid: ${capability}`);
      }
      const absolute = resolve(resolvedRoot, file);
      if (!isInside(resolvedRoot, absolute)) {
        throw new Error(`Retained V3 coverage path escapes the repository: ${file}`);
      }
      const entry = await stat(absolute);
      if (!entry.isFile()) throw new Error(`Retained V3 coverage path is not a file: ${file}`);
      if (containsLegacyRole(await readFile(absolute, 'utf8'))) {
        throw new Error(`Retained V3 coverage depends on a legacy workspace: ${file}`);
      }
    }
  }
  return true;
}

export async function scanLegacyReferences(root = projectRoot) {
  const resolvedRoot = resolve(root);
  const files = await collectTextFiles(resolvedRoot);
  const sources = new Map();
  const referenceFiles = [];

  for (const file of files) {
    const source = await readFile(join(resolvedRoot, file), 'utf8');
    sources.set(file, source);
    if (containsLegacyRole(source)) referenceFiles.push(file);
  }
  return { files, referenceFiles, sources };
}

export async function buildLegacyDependencyInventory(root = projectRoot) {
  const resolvedRoot = resolve(root);
  await validateCoverageMatrix(resolvedRoot);
  const { files, referenceFiles, sources } = await scanLegacyReferences(resolvedRoot);
  const fileSet = new Set(files);
  const rewritePaths = rewritePathSet();
  const deletePaths = new Set();

  for (const path of fixedDeletePaths()) {
    if (await pathExists(join(resolvedRoot, path))) deletePaths.add(path);
  }

  for (const file of referenceFiles) {
    if (rewritePaths.has(file) || isDeferredPath(file)) continue;
    if (file.startsWith('tests/') || file.startsWith('scripts/')) deletePaths.add(file);
  }

  const imports = new Map();
  for (const file of files) {
    const dependencies = extractImportSpecifiers(sources.get(file) ?? '')
      .map((specifier) => resolveRepositoryImport(file, specifier, fileSet))
      .filter(Boolean);
    imports.set(file, dependencies);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const file of files) {
      if (!file.startsWith('tests/') || deletePaths.has(file) || rewritePaths.has(file)) continue;
      if ((imports.get(file) ?? []).some((dependency) => deletePaths.has(dependency))) {
        deletePaths.add(file);
        changed = true;
      }
    }
  }

  const matrix = JSON.parse(
    await readFile(join(resolvedRoot, 'specs', 'v3-retained-test-coverage.json'), 'utf8')
  );
  const retainedPaths = new Set(Object.values(matrix).flat());
  for (const retainedPath of retainedPaths) {
    if (deletePaths.has(retainedPath)) {
      throw new Error(`Legacy removal would delete retained V3 coverage: ${retainedPath}`);
    }
  }

  const deferredReferences = referenceFiles.filter(isDeferredPath);
  const unresolvedReferences = referenceFiles.filter(
    (file) =>
      !deletePaths.has(file) &&
      !rewritePaths.has(file) &&
      !isDeferredPath(file) &&
      !isLegacyRoot(file)
  );
  if (unresolvedReferences.length > 0) {
    throw new Error(
      `Unclassified legacy references:\n${unresolvedReferences.map((file) => `- ${file}`).join('\n')}`
    );
  }

  return {
    deletePaths: [...deletePaths].sort(),
    rewritePaths: [...rewritePaths].filter((path) => fileSet.has(path)).sort(),
    deferredReferences: deferredReferences.sort(),
    retainedPaths: [...retainedPaths].sort()
  };
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  buildLegacyDependencyInventory()
    .then((inventory) => console.log(JSON.stringify(inventory, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
