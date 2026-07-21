import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const sourceExtensions = /\.(?:cts|mts|ts|tsx)$/;
const approvedSharedAdapters = new Set([
  'platform/http/api-response.ts',
  'platform/http/binary-response.ts',
  'platform/http/download-response.ts'
]);
const allowedSqlSources = new Set(['json_each', 'json_tree']);

function normalized(value) {
  return value.replaceAll('\\', '/');
}

async function walk(directory) {
  if (!existsSync(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (sourceExtensions.test(entry.name)) files.push(target);
  }
  return files;
}

function sourceLocation(root, file) {
  return normalized(path.relative(root, file));
}

function moduleLocation(root, file) {
  const parts = sourceLocation(root, file).split('/');
  if (parts[0] !== 'modules' || !parts[1]) return undefined;
  const layer = ['domain', 'application', 'infrastructure', 'presentation', 'public'].includes(
    parts[2]
  )
    ? parts[2]
    : 'root';
  return { name: parts[1], layer };
}

function loadCompilerOptions(root) {
  const defaults = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    baseUrl: root,
    paths: { '@/*': ['*'] },
    allowJs: false
  };
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) return defaults;
  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) return defaults;
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configPath));
  return {
    ...defaults,
    ...parsed.options,
    paths: parsed.options.paths ?? defaults.paths
  };
}

function pathCandidates(raw) {
  const withoutJs = raw.replace(/\.(?:c|m)?js$/, '');
  return [
    raw,
    `${raw}.ts`,
    `${raw}.tsx`,
    `${withoutJs}.ts`,
    `${withoutJs}.tsx`,
    path.join(raw, 'index.ts'),
    path.join(withoutJs, 'index.ts')
  ];
}

function createResolver(root, compilerOptions) {
  const host = {
    ...ts.sys,
    getCurrentDirectory: () => root
  };

  return (specifier, containingFile) => {
    const resolved = ts.resolveModuleName(specifier, containingFile, compilerOptions, host)
      .resolvedModule?.resolvedFileName;
    if (resolved && !resolved.includes('/node_modules/')) return path.resolve(resolved);

    let raw;
    if (specifier.startsWith('.')) raw = path.resolve(path.dirname(containingFile), specifier);
    else if (specifier.startsWith('@/')) raw = path.resolve(root, specifier.slice(2));
    else return undefined;
    return pathCandidates(raw).find((candidate) => existsSync(candidate));
  };
}

function importsFrom(sourceFile) {
  const imports = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      imports.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
}

function sqlLiteralsFrom(sourceFile) {
  const literals = [];
  const visit = (node) => {
    let value;
    if (ts.isStringLiteralLike(node)) value = node.text;
    else if (ts.isTemplateExpression(node)) {
      value = node.head.text + node.templateSpans.map((span) => span.literal.text).join(' ');
    }
    if (value && /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REFERENCES)\b/i.test(value)) {
      literals.push(value);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return literals;
}

function sqlTables(source) {
  const tables = new Set();
  const commonTableExpressions = new Set(
    [...source.matchAll(/\b(?:WITH|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s+AS\s*\(/gi)].map((match) =>
      match[1].toLowerCase()
    )
  );
  const tablePattern =
    /\b(?:FROM|JOIN|INTO|UPDATE|REFERENCES|(?:CREATE|ALTER|DROP)\s+TABLE(?:\s+IF\s+(?:NOT\s+)?EXISTS)?)\s+["`\[]?([A-Za-z_][A-Za-z0-9_]*)/gi;
  for (const match of source.matchAll(tablePattern)) tables.add(match[1]);
  for (const match of source.matchAll(
    /\bCREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+[A-Za-z_][A-Za-z0-9_]*\s+ON\s+["`\[]?([A-Za-z_][A-Za-z0-9_]*)/gi
  )) {
    tables.add(match[1]);
  }
  return [...tables].filter((table) => !commonTableExpressions.has(table.toLowerCase()));
}

function layerViolation(sourceLayer, targetLayer) {
  const allowed = {
    domain: new Set(['domain']),
    application: new Set(['application', 'domain', 'public']),
    infrastructure: new Set(['infrastructure', 'application', 'domain', 'public']),
    presentation: new Set(['presentation', 'application', 'public']),
    public: new Set(['public', 'domain'])
  };
  return allowed[sourceLayer] && !allowed[sourceLayer].has(targetLayer);
}

function inspectBootstrap(root, file, sourceFile, violations) {
  const relative = sourceLocation(root, file);
  if (!relative.startsWith('bootstrap/')) return;

  const add = (detail) =>
    violations.push(`${relative}: composition behavior is forbidden (${detail})`);
  const visit = (node) => {
    if (ts.isAwaitExpression(node)) add('await');
    if (ts.isIfStatement(node) || ts.isSwitchStatement(node) || ts.isConditionalExpression(node)) {
      add('domain conditional');
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression.getText(sourceFile);
      if (/repository/i.test(receiver)) add('repository method call');
    }
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(sourceFile).replaceAll(/["']/g, '');
      if (
        name === 'execute' &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        add('anonymous application executor');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

async function requiredModuleSurfaceViolations(root) {
  const modulesRoot = path.join(root, 'modules');
  if (!existsSync(modulesRoot)) return [];
  const modules = (await readdir(modulesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const violations = [];
  for (const moduleName of modules) {
    const publicApi = path.join(modulesRoot, moduleName, 'public', `${moduleName}.api.ts`);
    const index = path.join(modulesRoot, moduleName, 'index.ts');
    if (!existsSync(publicApi)) {
      violations.push(`modules/${moduleName}: missing public/${moduleName}.api.ts`);
    }
    if (!existsSync(index))
      violations.push(`modules/${moduleName}: missing modules/${moduleName}/index.ts`);
  }
  return violations;
}

export async function checkApiNextArchitecture(root) {
  const sourceRoot = path.resolve(root);
  const compilerOptions = loadCompilerOptions(sourceRoot);
  const resolveImport = createResolver(sourceRoot, compilerOptions);
  const files = (await walk(sourceRoot)).sort((left, right) => left.localeCompare(right));
  const violations = await requiredModuleSurfaceViolations(sourceRoot);

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const relative = sourceLocation(sourceRoot, file);
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const sourceModule = moduleLocation(sourceRoot, file);

    for (const specifier of importsFrom(sourceFile)) {
      if (specifier === '@novel-tool/shared' || specifier.startsWith('@novel-tool/shared/')) {
        const allowed = relative.includes('/presentation/') || approvedSharedAdapters.has(relative);
        if (!allowed) {
          violations.push(`${relative}: shared transport import is forbidden outside presentation`);
        }
      }

      const resolved = resolveImport(specifier, file);
      if (!resolved) continue;
      const targetModule = moduleLocation(sourceRoot, resolved);
      if (!sourceModule || !targetModule) continue;

      if (sourceModule.name !== targetModule.name) {
        const targetRelative = sourceLocation(sourceRoot, resolved);
        if (!targetRelative.startsWith(`modules/${targetModule.name}/public/`)) {
          violations.push(
            `${relative}: cross-module internal import (${sourceModule.name} -> ${targetModule.name}): ${specifier}`
          );
        }
      } else if (layerViolation(sourceModule.layer, targetModule.layer)) {
        violations.push(
          `${relative}: layer direction ${sourceModule.layer} -> ${targetModule.layer} is forbidden: ${specifier}`
        );
      }
    }

    if (sourceModule) {
      const ownerPrefix = `${sourceModule.name.replaceAll('-', '_')}_`;
      for (const sql of sqlLiteralsFrom(sourceFile)) {
        for (const table of sqlTables(sql)) {
          const normalizedTable = table.toLowerCase();
          if (
            normalizedTable.startsWith(ownerPrefix) ||
            normalizedTable.startsWith('sqlite_') ||
            normalizedTable.startsWith('pragma_') ||
            allowedSqlSources.has(normalizedTable)
          ) {
            continue;
          }
          violations.push(
            `${relative}: foreign table prefix ${table}; ${sourceModule.name} owns ${ownerPrefix}*`
          );
        }
      }
    }

    inspectBootstrap(sourceRoot, file, sourceFile, violations);
  }

  return [...new Set(violations)].sort((left, right) => left.localeCompare(right));
}
