import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import ts from 'typescript';

const forbiddenIdentifiers = new Set([
  'window',
  'document',
  'indexedDB',
  'localStorage',
  'sessionStorage',
  'navigator',
  'EventSource'
]);

function forbiddenImport(specifier) {
  return (
    specifier === 'react' ||
    specifier.startsWith('react/') ||
    specifier === 'react-dom' ||
    specifier.startsWith('react-dom/') ||
    specifier === 'react-router' ||
    specifier.startsWith('react-router/') ||
    specifier === 'react-router-dom' ||
    specifier.startsWith('react-router-dom/') ||
    specifier === '@novel-tool/shared' ||
    specifier.startsWith('@novel-tool/shared/') ||
    specifier === '@/' ||
    specifier.startsWith('@/') ||
    specifier.includes('apps/')
  );
}

async function collectSourceFiles(directory, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) await collectSourceFiles(target, files);
    else if (entry.isFile() && ['.ts', '.tsx', '.mts', '.cts'].includes(extname(entry.name))) {
      files.push(target);
    }
  }
}

function importSpecifier(node) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    return ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
  }
  if (
    ts.isCallExpression(node) &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(node.arguments[0]) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
  ) {
    return node.arguments[0].text;
  }
  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
  ) {
    return node.argument.literal.text;
  }
  return null;
}

function isPropertyName(node) {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isPropertySignature(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isMethodSignature(parent) && parent.name === node)
  );
}

export async function checkReaderEngineArchitecture(projectRoot) {
  const sourceRoot = join(projectRoot, 'packages', 'reader-engine', 'src');
  const files = [];
  try {
    await collectSourceFiles(sourceRoot, files);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return ['packages/reader-engine/src is missing'];
    }
    throw error;
  }

  const errors = [];
  for (const file of files.sort()) {
    const sourceText = await readFile(file, 'utf8');
    const sourceFile = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    const displayPath = relative(projectRoot, file).replaceAll('\\', '/');

    function visit(node) {
      const specifier = importSpecifier(node);
      if (specifier && forbiddenImport(specifier)) {
        errors.push(`${displayPath}: forbidden import '${specifier}'`);
      }
      if (ts.isIdentifier(node) && forbiddenIdentifiers.has(node.text) && !isPropertyName(node)) {
        errors.push(`${displayPath}: forbidden browser identifier '${node.text}'`);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return [...new Set(errors)].sort();
}
