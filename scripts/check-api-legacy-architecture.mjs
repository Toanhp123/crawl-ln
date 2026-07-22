import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';

const sourceRoot = resolve('apps/api-legacy/src');
const modulesRoot = join(sourceRoot, 'modules');
const violations = [];
const files = [];
const graph = new Map();

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (path.endsWith('.ts')) files.push(path);
  }
}

function importsOf(source) {
  const imports = [];
  const re = /import\s+(?:type\s+)?(?:[^'\"]+from\s+)?['\"]([^'\"]+)['\"]/g;
  let match;
  while ((match = re.exec(source))) imports.push(match[1]);
  return imports;
}

function moduleOf(path) {
  const normalizedPath = path.replaceAll('\\', '/');
  return normalizedPath.match(/\/modules\/([^/]+)\//)?.[1];
}

function resolveImport(from, target) {
  if (!target.startsWith('.')) return undefined;
  const raw = resolve(dirname(from), target);
  const candidates = [raw, raw.replace(/\.js$/, '.ts'), join(raw, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate));
}

function checkFile(path) {
  const normalizedPath = path.replaceAll('\\', '/');
  const source = readFileSync(path, 'utf8');
  const imports = importsOf(source);
  const isDomain = normalizedPath.includes('/domain/');
  const isApplication = normalizedPath.includes('/application/');
  const isInfrastructure = normalizedPath.includes('/infrastructure/');
  const isPresentation = normalizedPath.includes('/presentation/');
  const sourceModule = moduleOf(path);
  const edges = [];

  if (
    normalizedPath.includes('/modules/source-reader/') &&
    source.includes('IsolatedWorkerPluginRuntime')
  ) {
    violations.push(`${normalizedPath}: legacy IsolatedWorkerPluginRuntime is forbidden`);
  }
  if (
    normalizedPath.includes('/modules/source-reader/infrastructure/runtime/') &&
    !normalizedPath.includes('/browser-worker/') &&
    imports.includes('node:worker_threads')
  ) {
    violations.push(
      `${normalizedPath}: node:worker_threads is allowed only for the browser worker, never as an external plugin security boundary`
    );
  }
  if (
    normalizedPath.includes('/modules/source-reader/infrastructure/runtime/external-process/') &&
    imports.some((target) =>
      [
        'node:net',
        'node:tls',
        'node:dgram',
        'node:http',
        'node:https',
        'node:worker_threads'
      ].includes(target)
    )
  ) {
    violations.push(
      `${normalizedPath}: external process host code must not open raw network transports; plugin traffic goes through host capabilities`
    );
  }

  if (normalizedPath.includes('/shared/errors/')) {
    violations.push(
      `${normalizedPath}: application errors must be module-owned; shared must not define business or transport error classes`
    );
  }

  if (normalizedPath.includes('/shared/domain/')) {
    violations.push(
      `${normalizedPath}: shared must not own bounded-context business concepts; move the policy to its owning module or define an explicit minimal kernel contract`
    );
  }

  if (normalizedPath.includes('/modules/') && normalizedPath.includes('/public/')) {
    for (const target of imports) {
      if (/application\/(?:services|use-cases)\//.test(target)) {
        violations.push(
          `${normalizedPath}: public facade imports a concrete application service/use case; expose a module-owned interface and model contract instead: ${target}`
        );
      }
    }
  }

  const compositionMatch = normalizedPath.match(
    /\/shared\/container\/modules\/([^/]+)\.module\.ts$/
  );
  if (compositionMatch) {
    const compositionOwner = compositionMatch[1].replace(/-persistence$/, '');
    const ownerAliases = new Set([compositionOwner, compositionOwner.replace(/s$/, '')]);
    for (const target of imports) {
      const importedInfrastructure = target.match(/modules\/([^/]+)\/infrastructure\//)?.[1];
      if (importedInfrastructure && !ownerAliases.has(importedInfrastructure)) {
        violations.push(
          `${normalizedPath}: module composition borrows infrastructure owned by another bounded context (${importedInfrastructure}); move generic adapters to shared infrastructure or expose a public module contract`
        );
      }
    }
  }

  const mappedControllerModules = [
    '/modules/novels/',
    '/modules/chapters/',
    '/modules/task/',
    '/modules/crawler/'
  ];
  if (
    normalizedPath.includes('/presentation/controllers/') &&
    mappedControllerModules.some((segment) => normalizedPath.includes(segment)) &&
    /(?:ok|accepted)\(res,\s*await\s+this\.[\w]+\.execute\(/.test(source)
  ) {
    violations.push(
      `${normalizedPath}: controller returns an application result directly; map it through a presentation transport mapper`
    );
  }

  const publicFacadeModules = [
    'chapters.module.ts',
    'crawler.module.ts',
    'novels.module.ts',
    'plugin.module.ts',
    'scheduler.module.ts',
    'source-reader.module.ts',
    'tasks.module.ts'
  ];
  if (
    normalizedPath.endsWith('/shared/container/modules/source-reader.module.ts') &&
    (!/satisfies\s+SourceReaderApi/.test(source) ||
      !/satisfies\s+SourceReaderManagementApi/.test(source))
  ) {
    violations.push(
      `${normalizedPath}: Source Reader composition must constrain both reader and management public facades`
    );
  }

  if (
    normalizedPath.includes('/shared/container/modules/') &&
    publicFacadeModules.some((name) => normalizedPath.endsWith(name)) &&
    !/satisfies\s+\w+(?:Api|Lifecycle)/.test(source)
  ) {
    violations.push(
      `${normalizedPath}: cross-module surface is inferred from concrete implementations; constrain it with a module-owned public API facade`
    );
  }

  const isRoute =
    normalizedPath.includes('/presentation/routes/') ||
    normalizedPath.endsWith('/presentation/scheduler.routes.ts');
  if (isRoute && source.includes('AppContainer')) {
    violations.push(
      `${normalizedPath}: route factory depends on global AppContainer; accept only module controllers`
    );
  }

  if (
    normalizedPath.includes('/modules/crawler/infrastructure/sqlite/') &&
    /UPDATE\s+(?:chapters|crawl_tasks|novels)/i.test(source)
  ) {
    violations.push(
      `${normalizedPath}: crawler infrastructure must not write chapter, task, or novel tables; coordinate module-owned writers through the application unit of work`
    );
  }

  if (
    normalizedPath.includes('/modules/source-reader/') &&
    !normalizedPath.includes('/presentation/') &&
    /\b(?:INSERT|UPDATE|DELETE)\s+(?:novels|chapters|crawl_tasks)\b/i.test(source)
  ) {
    violations.push(
      `${normalizedPath}: Source Reader must not persist novels, chapters, or crawl tasks`
    );
  }

  if (
    normalizedPath.endsWith('/modules/crawler/application/services/crawl-job-runner.service.ts') ||
    normalizedPath.endsWith('/modules/crawler/application/use-cases/create-crawl-job.usecase.ts') ||
    normalizedPath.endsWith('/modules/crawler/application/use-cases/recover-crawl-jobs.usecase.ts')
  ) {
    if (/CrawlEventRepository/.test(source)) {
      violations.push(
        `${normalizedPath}: non-critical crawl audit persistence must be published through CrawlAuditPublisherPort`
      );
    }
  }

  if (
    normalizedPath.endsWith('/modules/scheduler/application/auto-update-scheduler.service.ts') &&
    /SchedulerDiagnosticsRepository/.test(source)
  ) {
    violations.push(
      `${normalizedPath}: scheduler diagnostics are a non-critical side effect; publish through NovelUpdateDiagnosticPublisherPort`
    );
  }

  if (normalizedPath.endsWith('/modules/novels/domain/repositories/novel.repository.ts')) {
    const forbiddenProcessMethods =
      /\b(?:findChapter|updateChapter|saveNovel|deleteById|persistAnalysis|deleteNovel)\s*\(/;
    if (forbiddenProcessMethods.test(source)) {
      violations.push(
        `${normalizedPath}: NovelRepository must remain novel-only; chapter/task and multi-table process persistence belongs behind application ports`
      );
    }
  }

  if (
    normalizedPath.endsWith('/shared/container/modules/infrastructure.module.ts') &&
    /modules\/(?:novels|task|chapters|crawler|scheduler)\/infrastructure/.test(source)
  ) {
    violations.push(
      `${normalizedPath}: shared infrastructure module constructs feature repositories; repository ownership belongs to feature modules`
    );
  }

  if (
    normalizedPath.includes('/shared/container/') &&
    /modules\/(?:novels|task|chapters|crawler|scheduler)\/domain\/(?:entities|value-objects)/.test(
      source
    )
  ) {
    violations.push(
      `${normalizedPath}: composition root contains domain behavior; inject a module-owned public service instead`
    );
  }
  if (normalizedPath.includes('/shared/container/') && /\.internal\.repository/.test(source)) {
    violations.push(
      `${normalizedPath}: composition root reaches into internal.repository; use a public module API`
    );
  }

  if ((isDomain || isApplication) && /\b(?:Date\.now\(\)|new Date\(\s*\))/.test(source)) {
    violations.push(`${normalizedPath}: core layer reads system time directly; inject ClockPort`);
  }

  for (const target of imports) {
    if (
      sourceModule &&
      sourceModule !== 'source-reader' &&
      target.includes('/modules/source-reader/') &&
      !target.includes('/modules/source-reader/public/')
    ) {
      violations.push(
        `${normalizedPath}: imports Source Reader internals; depend only on modules/source-reader/public/*: ${target}`
      );
    }
    if ((isDomain || isApplication) && target.includes('/infrastructure/')) {
      violations.push(`${normalizedPath}: core layer imports infrastructure: ${target}`);
    }
    if ((isDomain || isApplication) && target.includes('/presentation/')) {
      violations.push(`${normalizedPath}: core layer imports presentation: ${target}`);
    }
    if (isDomain && target === '@novel-tool/shared') {
      violations.push(
        `${normalizedPath}: domain imports transport contracts from @novel-tool/shared; define module-owned domain types and map at application/presentation boundaries`
      );
    }
    if (isApplication && target === '@novel-tool/shared') {
      violations.push(
        `${normalizedPath}: application imports transport contracts from @novel-tool/shared; define module-owned application contracts and map only at presentation boundaries`
      );
    }
    if ((isDomain || isApplication) && target.includes('/shared/errors/')) {
      violations.push(
        `${normalizedPath}: application errors must be module-owned; do not import shared error classes: ${target}`
      );
    }
    if (isDomain && target.includes('/shared/http/')) {
      violations.push(`${normalizedPath}: domain imports HTTP layer: ${target}`);
    }
    if (isDomain && target.includes('/shared/errors/http-error')) {
      violations.push(`${normalizedPath}: domain imports HTTP error adapter: ${target}`);
    }

    const resolved = resolveImport(path, target);
    if (!resolved) continue;
    edges.push(resolved);
    const targetModule = moduleOf(resolved);

    if (sourceModule && targetModule && sourceModule !== targetModule) {
      violations.push(
        `${normalizedPath}: imports another bounded context directly; communicate through a local port, shared kernel, or composition root: ${target}`
      );
    }
  }

  graph.set(path, edges);
}

function findCycles() {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(file) {
    if (visiting.has(file)) {
      const index = stack.indexOf(file);
      const cycle = [...stack.slice(index), file].map((item) =>
        item.replace(sourceRoot, 'apps/api-legacy/src').replaceAll('\\', '/')
      );
      violations.push(`dependency cycle: ${cycle.join(' -> ')}`);
      return;
    }
    if (visited.has(file)) return;
    visiting.add(file);
    stack.push(file);
    for (const next of graph.get(file) ?? []) visit(next);
    stack.pop();
    visiting.delete(file);
    visited.add(file);
  }

  for (const file of files) visit(file);
}

const sandboxLoader = join(
  sourceRoot,
  'modules/source-reader/infrastructure/runtime/external-process/sandbox-module-loader.ts'
);
if (!existsSync(sandboxLoader)) {
  violations.push('sandbox-module-loader: external plugin deny-by-default loader is required');
}

walk(sourceRoot);
for (const file of files) checkFile(file);
findCycles();

const unique = [...new Set(violations)];
if (unique.length > 0) {
  console.error(
    'API architecture violations found:\n' + unique.map((item) => `- ${item}`).join('\n')
  );
  process.exit(1);
}

console.log('API architecture check passed.');
