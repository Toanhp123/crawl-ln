export const directoryMoves = [
  { from: 'apps/api', to: 'apps/api-legacy', kind: 'directory' },
  { from: 'apps/web', to: 'apps/web-legacy', kind: 'directory' },
  { from: 'apps/api-next', to: 'apps/api', kind: 'directory' },
  { from: 'apps/web-next', to: 'apps/web', kind: 'directory' },
  {
    from: 'scripts/check-api-architecture.mjs',
    to: 'scripts/check-api-legacy-architecture.mjs',
    kind: 'file'
  },
  {
    from: 'scripts/check-web-architecture.mjs',
    to: 'scripts/check-web-legacy-architecture.mjs',
    kind: 'file'
  },
  {
    from: 'scripts/check-web-contracts.mjs',
    to: 'scripts/check-web-legacy-contracts.mjs',
    kind: 'file'
  },
  {
    from: 'scripts/check-api-next-architecture.mjs',
    to: 'scripts/check-api-architecture.mjs',
    kind: 'file'
  },
  {
    from: 'scripts/check-web-next-architecture.mjs',
    to: 'scripts/check-web-architecture.mjs',
    kind: 'file'
  },
  {
    from: 'scripts/check-web-next-contracts.mjs',
    to: 'scripts/check-web-contracts.mjs',
    kind: 'file'
  },
  {
    from: 'scripts/lib/api-next-architecture.mjs',
    to: 'scripts/lib/api-architecture.mjs',
    kind: 'file'
  },
  {
    from: 'scripts/lib/web-next-architecture.mjs',
    to: 'scripts/lib/web-architecture.mjs',
    kind: 'file'
  },
  { from: 'playwright.config.ts', to: 'playwright.legacy.config.ts', kind: 'file' },
  { from: 'playwright.web-next.config.ts', to: 'playwright.config.ts', kind: 'file' }
];

export const packageNameTransforms = [
  { from: '@novel-tool/api-next', to: '@novel-tool/api' },
  { from: '@novel-tool/web-next', to: '@novel-tool/web' },
  { from: '@novel-tool/api', to: '@novel-tool/api-legacy' },
  { from: '@novel-tool/web', to: '@novel-tool/web-legacy' }
];

export const environmentNameTransforms = [
  { from: 'NEXT_API_HOST', to: 'HOST' },
  { from: 'NEXT_API_PORT', to: 'PORT' },
  { from: 'NEXT_DATABASE_PATH', to: 'DATABASE_PATH' },
  { from: 'NEXT_STORAGE_DIR', to: 'STORAGE_DIR' },
  { from: 'NEXT_OUTBOX_BATCH_SIZE', to: 'OUTBOX_BATCH_SIZE' },
  { from: 'NEXT_OUTBOX_INTERVAL_MS', to: 'OUTBOX_INTERVAL_MS' }
];

export const scriptNameTransforms = [
  { from: 'dev:api-next', to: 'dev:api' },
  { from: 'dev:web-next', to: 'dev:web' },
  { from: 'build:api-next', to: 'build:api' },
  { from: 'build:web-next', to: 'build:web' },
  { from: 'check:api-next-arch', to: 'check:arch' },
  { from: 'check:web-next-arch', to: 'check:web-arch' },
  { from: 'check:web-next-contracts', to: 'check:web-contracts' },
  { from: 'check:api-next', to: 'check:api' },
  { from: 'check:web-next', to: 'check:web' },
  { from: 'test:e2e:web-next', to: 'test:e2e' },
  { from: 'e2e:web-next', to: 'e2e' },
  { from: 'check:next-types', to: 'check:types' },
  { from: 'build:next', to: 'build' },
  { from: 'check-api-next-architecture.mjs', to: 'check-api-architecture.mjs' },
  { from: 'check-web-next-architecture.mjs', to: 'check-web-architecture.mjs' },
  { from: 'check-web-next-contracts.mjs', to: 'check-web-contracts.mjs' },
  { from: 'api-next-architecture.mjs', to: 'api-architecture.mjs' },
  { from: 'web-next-architecture.mjs', to: 'web-architecture.mjs' },
  { from: 'playwright.web-next.config.ts', to: 'playwright.config.ts' }
];

export const architectureRootTransforms = [
  { from: 'ApiNext', to: 'Api' },
  { from: 'WebNext', to: 'Web' },
  { from: 'apiNext', to: 'api' },
  { from: 'webNext', to: 'web' },
  { from: 'NextEnvironment', to: 'Environment' },
  { from: 'createNextAppRuntime', to: 'createAppRuntime' },
  { from: 'nextApiRuntime', to: 'apiRuntime' }
];

export const portTransforms = [
  { from: '3100', to: '3000', scope: 'canonical-api' },
  { from: '5174', to: '5173', scope: 'canonical-web' },
  { from: '4174', to: '4173', scope: 'canonical-preview' }
];

export const playwrightTransforms = [
  { from: 'playwright.web-next.config.ts', to: 'playwright.config.ts' },
  { from: 'playwright.config.ts', to: 'playwright.legacy.config.ts' },
  { from: '@novel-tool/web-next', to: '@novel-tool/web' },
  { from: '@novel-tool/web', to: '@novel-tool/web-legacy' }
];

export const testPathTransforms = [
  { from: 'apps/api-next/', to: 'apps/api/' },
  { from: 'apps/web-next/', to: 'apps/web/' },
  { from: 'apps/api/', to: 'apps/api-legacy/' },
  { from: 'apps/web/', to: 'apps/web-legacy/' }
];

export const workspaceCutoverMap = {
  formatVersion: 1,
  directoryMoves,
  packageNameTransforms,
  environmentNameTransforms,
  scriptNameTransforms,
  architectureRootTransforms,
  portTransforms,
  playwrightTransforms,
  testPathTransforms
};

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.md',
  '.sh',
  '.ts',
  '.tsx',
  '.yml',
  '.yaml'
]);

function normalized(path) {
  return path.replaceAll('\\', '/');
}

function isCanonicalSource(sourcePath, targetPath) {
  const source = normalized(sourcePath);
  const target = normalized(targetPath);
  return (
    source.startsWith('apps/api-next/') ||
    source.startsWith('apps/web-next/') ||
    source.includes('api-next') ||
    source.includes('web-next') ||
    target.startsWith('apps/api/') ||
    target.startsWith('apps/web/') ||
    target === 'playwright.config.ts'
  );
}

function replaceWithPlaceholders(content) {
  const placeholders = [
    ['@novel-tool/api-next', '\u0001CANONICAL_API_PACKAGE\u0001'],
    ['@novel-tool/web-next', '\u0001CANONICAL_WEB_PACKAGE\u0001'],
    ['@novel-tool/api', '\u0001LEGACY_API_PACKAGE\u0001'],
    ['@novel-tool/web', '\u0001LEGACY_WEB_PACKAGE\u0001'],
    ['apps/api-next', '\u0001CANONICAL_API_PATH\u0001'],
    ['apps/web-next', '\u0001CANONICAL_WEB_PATH\u0001'],
    ['apps/api', '\u0001LEGACY_API_PATH\u0001'],
    ['apps/web', '\u0001LEGACY_WEB_PATH\u0001']
  ];
  let value = content;
  for (const [from, to] of placeholders) value = value.replaceAll(from, to);
  return value;
}

function restorePlaceholders(content) {
  return content
    .replaceAll('\u0001CANONICAL_API_PACKAGE\u0001', '@novel-tool/api')
    .replaceAll('\u0001CANONICAL_WEB_PACKAGE\u0001', '@novel-tool/web')
    .replaceAll('\u0001LEGACY_API_PACKAGE\u0001', '@novel-tool/api-legacy')
    .replaceAll('\u0001LEGACY_WEB_PACKAGE\u0001', '@novel-tool/web-legacy')
    .replaceAll('\u0001CANONICAL_API_PATH\u0001', 'apps/api')
    .replaceAll('\u0001CANONICAL_WEB_PATH\u0001', 'apps/web')
    .replaceAll('\u0001LEGACY_API_PATH\u0001', 'apps/api-legacy')
    .replaceAll('\u0001LEGACY_WEB_PATH\u0001', 'apps/web-legacy');
}

function rewriteRootPackage(content) {
  const packageJson = JSON.parse(content);
  const scripts = { ...(packageJson.scripts ?? {}) };
  const prepare = 'npm run prepare:packages && ';
  scripts.dev = `${prepare}concurrently -k -n api,web "npm run dev -w @novel-tool/api" "npm run dev -w @novel-tool/web"`;
  scripts['dev:api'] = `${prepare}npm run dev -w @novel-tool/api`;
  scripts['dev:web'] = `${prepare}npm run dev -w @novel-tool/web`;
  scripts['dev:legacy'] =
    `${prepare}concurrently -k -n api-legacy,web-legacy "npm run dev -w @novel-tool/api-legacy" "npm run dev -w @novel-tool/web-legacy"`;
  scripts['dev:api-legacy'] = `${prepare}npm run dev -w @novel-tool/api-legacy`;
  scripts['dev:web-legacy'] = `${prepare}npm run dev -w @novel-tool/web-legacy`;
  scripts['build:api'] = `${prepare}npm run build -w @novel-tool/api`;
  scripts['build:web'] = `${prepare}npm run build -w @novel-tool/web`;
  scripts['build:legacy'] =
    `${prepare}npm run build -w @novel-tool/api-legacy && npm run build -w @novel-tool/web-legacy`;
  scripts['check:api'] = `${prepare}npm run check -w @novel-tool/api`;
  scripts['check:web'] = `${prepare}npm run check -w @novel-tool/web`;
  scripts['check:legacy'] =
    `${prepare}npm run check -w @novel-tool/api-legacy && npm run check -w @novel-tool/web-legacy && node scripts/check-api-legacy-architecture.mjs && node scripts/check-web-legacy-architecture.mjs && node scripts/check-web-legacy-contracts.mjs`;
  scripts['test:e2e:legacy'] = 'playwright test --config playwright.legacy.config.ts';
  for (const key of Object.keys(scripts)) {
    if (key.includes('-next') || key === 'test:e2e:web-next') delete scripts[key];
  }
  const generatedKeys = new Set([
    'dev',
    'dev:api',
    'dev:web',
    'dev:legacy',
    'dev:api-legacy',
    'dev:web-legacy',
    'build:api',
    'build:web',
    'build:legacy',
    'check:api',
    'check:web',
    'check:legacy',
    'test:e2e:legacy'
  ]);
  for (const [key, value] of Object.entries(scripts)) {
    if (generatedKeys.has(key) || typeof value !== 'string') continue;
    let rewritten = restorePlaceholders(replaceWithPlaceholders(value));
    for (const transform of scriptNameTransforms)
      rewritten = rewritten.replaceAll(transform.from, transform.to);
    for (const transform of architectureRootTransforms)
      rewritten = rewritten.replaceAll(transform.from, transform.to);
    scripts[key] = rewritten;
  }
  if (typeof scripts['verify:v3:frontend'] === 'string') {
    scripts['verify:v3:frontend'] = scripts['verify:v3:frontend'].replace(
      'npm run build:web && npm run build:web',
      'npm run build:web-legacy && npm run build:web'
    );
  }
  packageJson.scripts = scripts;
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function rewritePackageJson(content, targetPath) {
  const packageJson = JSON.parse(content);
  const normalizedTarget = normalized(targetPath);
  if (normalizedTarget === 'apps/api/package.json') packageJson.name = '@novel-tool/api';
  if (normalizedTarget === 'apps/web/package.json') packageJson.name = '@novel-tool/web';
  if (normalizedTarget === 'apps/api-legacy/package.json')
    packageJson.name = '@novel-tool/api-legacy';
  if (normalizedTarget === 'apps/web-legacy/package.json')
    packageJson.name = '@novel-tool/web-legacy';
  if (normalizedTarget === 'package.json') return rewriteRootPackage(content);
  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function rewritePlaywright(content, targetPath) {
  let value = content;
  if (normalized(targetPath) === 'playwright.legacy.config.ts') {
    return value.replaceAll('@novel-tool/web', '@novel-tool/web-legacy').replaceAll('4173', '4174');
  }
  return value
    .replaceAll('@novel-tool/web-next', '\u0001CANONICAL_WEB_PACKAGE\u0001')
    .replaceAll('@novel-tool/web', '\u0001LEGACY_WEB_PACKAGE\u0001')
    .replaceAll('4174', '\u0001CANONICAL_WEB_PORT\u0001')
    .replaceAll('4173', '\u0001LEGACY_WEB_PORT\u0001')
    .replaceAll('\u0001CANONICAL_WEB_PACKAGE\u0001', '@novel-tool/web')
    .replaceAll('\u0001LEGACY_WEB_PACKAGE\u0001', '@novel-tool/web-legacy')
    .replaceAll('\u0001CANONICAL_WEB_PORT\u0001', '4173')
    .replaceAll('\u0001LEGACY_WEB_PORT\u0001', '4174');
}

export function mapWorkspacePath(path) {
  const value = normalized(path);
  for (const move of [...directoryMoves].sort(
    (left, right) => right.from.length - left.from.length
  )) {
    if (value === move.from) return move.to;
    if (value.startsWith(`${move.from}/`)) return `${move.to}${value.slice(move.from.length)}`;
  }
  return value;
}

export function isTextWorkspacePath(path) {
  const value = normalized(path);
  const name = value.slice(value.lastIndexOf('/') + 1);
  if (name === '.env' || name.startsWith('.env.')) return true;
  const extension = value.slice(value.lastIndexOf('.')).toLowerCase();
  return textExtensions.has(extension) || value === 'Dockerfile';
}

export function rewriteWorkspaceContent({ sourcePath, targetPath, content }) {
  const source = normalized(sourcePath);
  const target = normalized(targetPath);
  if (!isTextWorkspacePath(target))
    return Buffer.isBuffer(content) ? content : Buffer.from(content);
  const original = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (original.includes(0)) return original;
  if (target === 'package.json') return Buffer.from(rewriteRootPackage(original.toString('utf8')));
  if (target.endsWith('/package.json')) {
    return Buffer.from(rewritePackageJson(original.toString('utf8'), target));
  }
  if (target === 'playwright.config.ts' || target === 'playwright.legacy.config.ts') {
    return Buffer.from(rewritePlaywright(original.toString('utf8'), target));
  }

  const canonical = isCanonicalSource(source, target);
  let value = replaceWithPlaceholders(original.toString('utf8'));
  const parityTest = source === 'tests/e2e/web-next-semantic-parity.spec.ts';
  if (parityTest) {
    value = value
      .replaceAll('http://127.0.0.1:4173', '\u0001LEGACY_PREVIEW\u0001')
      .replaceAll('http://127.0.0.1:4174', '\u0001CANONICAL_PREVIEW\u0001');
  }
  if (
    canonical ||
    source.startsWith('scripts/') ||
    source.startsWith('tests/') ||
    source.startsWith('.github/')
  ) {
    for (const transform of environmentNameTransforms)
      value = value.replaceAll(transform.from, transform.to);
    for (const transform of architectureRootTransforms)
      value = value.replaceAll(transform.from, transform.to);
    for (const transform of scriptNameTransforms)
      value = value.replaceAll(transform.from, transform.to);
    value = value.replaceAll('check-api-next-architecture.mjs', 'check-api-architecture.mjs');
    value = value.replaceAll('check-web-next-architecture.mjs', 'check-web-architecture.mjs');
    value = value.replaceAll('check-web-next-contracts.mjs', 'check-web-contracts.mjs');
    value = value.replaceAll('playwright.web-next.config.ts', 'playwright.config.ts');
    value = value.replace(/(['"])api-next\1/g, '$1api$1').replace(/(['"])web-next\1/g, '$1web$1');
    value = value.replaceAll('3100', '3000').replaceAll('5174', '5173').replaceAll('4174', '4173');
  }
  value = restorePlaceholders(value);
  if (parityTest) {
    value = value
      .replaceAll('\u0001LEGACY_PREVIEW\u0001', 'http://127.0.0.1:4174')
      .replaceAll('\u0001CANONICAL_PREVIEW\u0001', 'http://127.0.0.1:4173');
  }
  if (target === 'apps/api/src/platform/config/environment.ts') {
    value = value.replace(/(\s+STORAGE_DIR: [^\n]+\n)\s+STORAGE_DIR: [^\n]+\n/, '$1');
    value = value.replaceAll('parsed.STORAGE_DIR ?? parsed.STORAGE_DIR', 'parsed.STORAGE_DIR');
  }
  return Buffer.from(value);
}
