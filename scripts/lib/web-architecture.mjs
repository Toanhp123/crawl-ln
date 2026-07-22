import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

export const layerRank = new Map([
  ['shared', 0],
  ['entities', 1],
  ['features', 2],
  ['widgets', 3],
  ['pages', 4],
  ['app', 5]
]);

export const forbiddenSharedMarkers = [
  /(^|\/)(novel|chapter|task|scheduler|source-reader|reader-navigation)(\/|\.|$)/i,
  /\/api\/(novels|crawl|tasks|scheduler|source-reader|search|backups|exports?)(\/|['"`?])/i,
  /\b(NovelQueryKeys|ChapterQueryKeys|TaskQueryKeys|SourceReader|ReaderPreferences)\b/
];

const slicedLayers = new Set(['entities', 'features', 'widgets', 'pages']);
const sourceExtensions = /\.(?:cts|mts|ts|tsx)$/;
const styleExtensions = /\.(?:css|less|sass|scss)$/;
const queryHookPattern = /^use.*Quer(?:y|ies)$/;
const mutationHookPattern = /^use.*Mutat/;
const mutatingHttpMethods = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);
const sharedStyleTokenPattern = /(?:\.[a-z_][a-z0-9_-]*|data-[a-z0-9_-]+|--[a-z0-9_-]+)/gi;
const readerCssPatterns = [
  /data-reader-[a-z0-9_-]+/gi,
  /--reader-[a-z0-9_-]+/gi,
  /\.reader-[a-z0-9_-]+/gi
];

function normalized(value) {
  return value.replaceAll('\\', '/');
}

async function walk(directory, matcher) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target, matcher)));
    else if (matcher.test(entry.name)) files.push(target);
  }
  return files;
}

function sourceLocation(projectRoot, file) {
  return normalized(path.relative(projectRoot, file));
}

function fsdLocation(sourceRoot, file) {
  const relative = normalized(path.relative(sourceRoot, file));
  if (relative.startsWith('../') || relative === '..') return undefined;
  const [layer, slice] = relative.split('/');
  if (!layerRank.has(layer)) return undefined;
  return {
    layer,
    rank: layerRank.get(layer),
    relative,
    slice: slicedLayers.has(layer) ? slice : undefined
  };
}

function loadCompilerOptions(projectRoot) {
  const defaults = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    baseUrl: projectRoot,
    paths: { '@/*': ['src/*'] },
    allowJs: false
  };
  const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) return defaults;
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) return defaults;
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath));
  return {
    ...defaults,
    ...parsed.options,
    baseUrl: parsed.options.baseUrl ?? defaults.baseUrl,
    paths: parsed.options.paths ?? defaults.paths
  };
}

function pathCandidates(raw) {
  const withoutJavaScriptExtension = raw.replace(/\.(?:c|m)?js$/, '');
  return [
    raw,
    `${raw}.ts`,
    `${raw}.tsx`,
    `${withoutJavaScriptExtension}.ts`,
    `${withoutJavaScriptExtension}.tsx`,
    path.join(raw, 'index.ts'),
    path.join(raw, 'index.tsx'),
    path.join(withoutJavaScriptExtension, 'index.ts'),
    path.join(withoutJavaScriptExtension, 'index.tsx')
  ];
}

function createResolver(projectRoot, compilerOptions) {
  const host = { ...ts.sys, getCurrentDirectory: () => projectRoot };
  return (specifier, containingFile) => {
    const resolved = ts.resolveModuleName(specifier, containingFile, compilerOptions, host)
      .resolvedModule?.resolvedFileName;
    if (resolved && !normalized(resolved).includes('/node_modules/')) return path.resolve(resolved);

    let raw;
    if (specifier.startsWith('.')) raw = path.resolve(path.dirname(containingFile), specifier);
    else if (specifier.startsWith('@/')) {
      raw = path.resolve(projectRoot, 'src', specifier.slice(2));
    } else {
      return undefined;
    }
    return pathCandidates(raw).find((candidate) => existsSync(candidate));
  };
}

function literalText(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteralLike(node.literal)) return node.literal.text;
  return undefined;
}

function moduleReferences(sourceFile) {
  const references = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      references.push({ node, specifier: node.moduleSpecifier.text });
    } else if (ts.isImportTypeNode(node)) {
      const specifier = literalText(node.argument);
      if (specifier) references.push({ node, specifier });
    } else if (ts.isCallExpression(node) && node.arguments.length >= 1) {
      const specifier = literalText(node.arguments[0]);
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (specifier && (isDynamicImport || isRequire)) references.push({ node, specifier });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

function sliceRoot(sourceRoot, location) {
  if (!location?.slice) return undefined;
  return path.join(sourceRoot, location.layer, location.slice);
}

function isPublicIndex(sourceRoot, targetFile, targetLocation) {
  const root = sliceRoot(sourceRoot, targetLocation);
  return root ? path.resolve(targetFile) === path.resolve(root, 'index.ts') : true;
}

function inspectModuleBoundaries({
  file,
  projectRoot,
  references,
  resolveModule,
  sourceLocation: source,
  sourceRoot,
  violations
}) {
  if (!source) return;

  for (const reference of references) {
    const targetFile = resolveModule(reference.specifier, file);
    if (!targetFile) continue;
    const target = fsdLocation(sourceRoot, targetFile);
    if (!target) continue;

    const externalSlice =
      target.slice && (source.layer !== target.layer || source.slice !== target.slice);

    if (source.rank < target.rank) {
      violations.push(
        `${sourceLocation(projectRoot, file)}: ${source.layer} cannot import upward from ${target.layer}: ${reference.specifier}`
      );
    }

    if (
      source.layer === target.layer &&
      source.slice &&
      target.slice &&
      source.slice !== target.slice
    ) {
      const detail = `${source.slice} -> ${target.slice}: ${reference.specifier}`;
      violations.push(
        source.layer === 'pages'
          ? `${sourceLocation(projectRoot, file)}: page slices cannot import each other (${detail})`
          : `${sourceLocation(projectRoot, file)}: same-layer slices cannot cross-import (${detail})`
      );
    }

    if (externalSlice && !isPublicIndex(sourceRoot, targetFile, target)) {
      violations.push(
        `${sourceLocation(projectRoot, file)}: external consumers must import ${target.layer}/${target.slice} through its public index: ${reference.specifier}`
      );
    }
  }
}

function importedTanStackHooks(sourceFile) {
  const hooks = [];
  const namespaces = new Set();

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === '@tanstack/react-query'
    ) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          hooks.push(element.propertyName?.text ?? element.name.text);
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        namespaces.add(bindings.name.text);
      }
    }
  }

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'require' &&
      literalText(node.initializer.arguments[0]) === '@tanstack/react-query'
    ) {
      for (const element of node.name.elements) {
        if (ts.isIdentifier(element.name)) {
          hooks.push(
            element.propertyName && ts.isIdentifier(element.propertyName)
              ? element.propertyName.text
              : element.name.text
          );
        }
      }
    }

    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      namespaces.has(node.expression.text)
    ) {
      hooks.push(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...new Set(hooks)];
}

function inspectTanStackOwnership(projectRoot, file, source, sourceFile, violations) {
  if (!source) return;
  for (const hook of importedTanStackHooks(sourceFile)) {
    if (queryHookPattern.test(hook) && source.layer !== 'entities') {
      violations.push(
        `${sourceLocation(projectRoot, file)}: direct TanStack query hooks belong to entities (${hook})`
      );
    }
    if (mutationHookPattern.test(hook) && source.layer !== 'features') {
      violations.push(
        source.layer === 'pages'
          ? `${sourceLocation(projectRoot, file)}: pages cannot own product mutations (${hook})`
          : `${sourceLocation(projectRoot, file)}: direct TanStack mutation hooks belong to features (${hook})`
      );
    }
  }
}

function callExpressionText(expression, sourceFile) {
  return expression.getText(sourceFile).replaceAll(/\s+/g, '');
}

function enclosingCall(node) {
  let current = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isCallExpression(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function inspectMutatingHttp(projectRoot, file, source, sourceFile, violations) {
  if (!source || !new Set(['app', 'pages']).has(source.layer)) return;
  const reported = new Set();
  const report = (method, node) => {
    const key = `${method}:${node.pos}`;
    if (reported.has(key)) return;
    reported.add(key);
    violations.push(
      `${sourceLocation(projectRoot, file)}: app/pages cannot issue mutating HTTP requests (${method})`
    );
  };

  const visit = (node) => {
    if (ts.isPropertyAssignment(node)) {
      const propertyName = node.name.getText(sourceFile).replaceAll(/["']/g, '');
      const method = literalText(node.initializer)?.toUpperCase();
      const call = enclosingCall(node);
      if (
        propertyName === 'method' &&
        method &&
        mutatingHttpMethods.has(method) &&
        call &&
        /(?:fetch|request|client|api|http|axios|transport)/i.test(
          callExpressionText(call.expression, sourceFile)
        )
      ) {
        report(method, node);
      }
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text.toUpperCase();
      const receiver = callExpressionText(node.expression.expression, sourceFile);
      if (
        mutatingHttpMethods.has(method) &&
        /(?:^|\.)(?:api|apiClient|client|http|httpClient|axios|request|transport)$/i.test(receiver)
      ) {
        report(method, node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function withoutAllowedSharedTerms(value) {
  return value
    .replaceAll(/novel-tool(?=[:/._-]|$)/gi, 'product-storage-prefix')
    .replaceAll(/timer(?:[-_\s]|(?=[A-Z]))*scheduler/gi, 'timer-utility');
}

function wordsFrom(value) {
  return withoutAllowedSharedTerms(value)
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll(/[^a-z0-9]+/gi, ' ')
    .trim();
}

function hasForbiddenSharedMarker(value) {
  const sanitized = withoutAllowedSharedTerms(value);
  const quotedBoundary = `${sanitized}'`;
  if (
    forbiddenSharedMarkers.some((marker) => marker.test(sanitized) || marker.test(quotedBoundary))
  ) {
    return true;
  }
  const words = wordsFrom(value);
  return /\b(?:novels?|chapters?|tasks?|scheduler|source\s+reader|reader\s+navigation)\b/i.test(
    words
  );
}

function declarationName(node) {
  if (!ts.isIdentifier(node)) return undefined;
  const parent = node.parent;
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isShorthandPropertyAssignment(parent) ||
      ts.isBindingElement(parent) ||
      ts.isEnumMember(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isParameter(parent)) &&
    parent.name === node
  ) {
    return node.text;
  }
  if (ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent) || ts.isImportClause(parent)) {
    return node.text;
  }
  return undefined;
}

function readerCssMarkers(value) {
  return readerCssPatterns.flatMap((pattern) =>
    [...value.matchAll(pattern)].map((match) => match[0])
  );
}

function domainCssMarkers(value) {
  return [...value.matchAll(sharedStyleTokenPattern)]
    .map((match) => match[0])
    .filter((marker) => hasForbiddenSharedMarker(marker));
}

function inspectSharedTypeScript(projectRoot, file, sourceFile, violations) {
  const reportedDomain = new Set();
  const reportedCss = new Set();
  const reportDomain = (value) => {
    if (!hasForbiddenSharedMarker(value) || reportedDomain.has(value)) return;
    reportedDomain.add(value);
    violations.push(
      `${sourceLocation(projectRoot, file)}: shared cannot own domain concepts (${value})`
    );
  };
  const reportCss = (value) => {
    for (const marker of readerCssMarkers(value)) {
      if (reportedCss.has(marker)) continue;
      reportedCss.add(marker);
      violations.push(
        `${sourceLocation(projectRoot, file)}: shared cannot own reader CSS (${marker})`
      );
    }
  };

  reportDomain(sourceLocation(projectRoot, file));
  const visit = (node) => {
    const name = declarationName(node);
    if (name) reportDomain(name);
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      reportDomain(node.text);
      reportCss(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

async function inspectSharedStyles(projectRoot, sourceRoot, violations) {
  const sharedRoot = path.join(sourceRoot, 'shared');
  for (const file of await walk(sharedRoot, styleExtensions)) {
    const source = await readFile(file, 'utf8');
    for (const marker of domainCssMarkers(source)) {
      violations.push(
        `${sourceLocation(projectRoot, file)}: shared cannot own domain CSS (${marker})`
      );
    }
    for (const marker of readerCssMarkers(source)) {
      violations.push(
        `${sourceLocation(projectRoot, file)}: shared cannot own reader CSS (${marker})`
      );
    }
  }
}

async function inspectSliceIndexes(projectRoot, sourceRoot, violations) {
  for (const layer of slicedLayers) {
    const layerRoot = path.join(sourceRoot, layer);
    if (!existsSync(layerRoot)) continue;
    const entries = await readdir(layerRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const index = path.join(layerRoot, entry.name, 'index.ts');
      if (!existsSync(index)) {
        violations.push(
          `${sourceLocation(projectRoot, path.join(layerRoot, entry.name))}: slice is missing index.ts`
        );
      }
    }
  }
}

export async function checkWebArchitecture(projectRoot) {
  const root = path.resolve(projectRoot);
  const sourceRoot = path.join(root, 'src');
  const compilerOptions = loadCompilerOptions(root);
  const resolveModule = createResolver(root, compilerOptions);
  const violations = [];

  await inspectSliceIndexes(root, sourceRoot, violations);

  for (const file of await walk(sourceRoot, sourceExtensions)) {
    const sourceText = await readFile(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const source = fsdLocation(sourceRoot, file);
    const references = moduleReferences(sourceFile);

    inspectModuleBoundaries({
      file,
      projectRoot: root,
      references,
      resolveModule,
      sourceLocation: source,
      sourceRoot,
      violations
    });
    inspectTanStackOwnership(root, file, source, sourceFile, violations);
    inspectMutatingHttp(root, file, source, sourceFile, violations);
    if (source?.layer === 'shared') inspectSharedTypeScript(root, file, sourceFile, violations);
  }

  await inspectSharedStyles(root, sourceRoot, violations);
  return violations.sort();
}
