import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import prettier from 'prettier';
import { checkDocumentation } from './check-docs.mjs';
import { checkTypeScriptProject } from './typescript-project.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skippedDirectories = new Set(['dist', 'node_modules']);

async function collectFormattedFiles(directory, extensions, files) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const target = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFormattedFiles(target, extensions, files);
    } else if (entry.isFile() && extensions.has(extname(entry.name))) {
      files.push(target);
    }
  }
}

async function checkFormatting() {
  const files = [];
  await collectFormattedFiles(join(projectRoot, 'apps'), new Set(['.ts', '.tsx']), files);
  await collectFormattedFiles(join(projectRoot, 'packages'), new Set(['.ts', '.tsx']), files);
  await collectFormattedFiles(join(projectRoot, 'scripts'), new Set(['.mjs']), files);
  await collectFormattedFiles(join(projectRoot, 'tests'), new Set(['.ts']), files);

  const prettierOptions = (await prettier.resolveConfig(join(projectRoot, 'package.json'))) ?? {};
  const unformatted = [];
  for (const file of files.sort()) {
    if (
      !(await prettier.check(await readFile(file, 'utf8'), {
        ...prettierOptions,
        filepath: file
      }))
    ) {
      unformatted.push(file.slice(projectRoot.length + 1));
    }
  }

  if (unformatted.length > 0) {
    throw new Error(
      `Prettier formatting issues:\n${unformatted.map((file) => `- ${file}`).join('\n')}`
    );
  }
  console.log('All matched files use Prettier code style!');
}

export async function runPreparedChecks({ skipTypeScript = false } = {}) {
  await import('./check-api-architecture.mjs');
  await import('./check-crawler-platform.mjs');
  await import('./check-web-architecture.mjs');
  await import('./check-web-contracts.mjs');

  const documentation = await checkDocumentation(projectRoot);
  if (!documentation.ok) {
    throw new Error(`Documentation check failed:\n${documentation.errors.join('\n')}`);
  }
  console.log('Documentation links, terminology, history boundaries, and duplicates are clean.');

  await checkFormatting();
  if (!skipTypeScript) {
    checkTypeScriptProject(join(projectRoot, 'packages', 'source-plugin-sdk', 'tsconfig.json'));
    checkTypeScriptProject(join(projectRoot, 'apps', 'api', 'tsconfig.json'));
    checkTypeScriptProject(join(projectRoot, 'apps', 'web', 'tsconfig.json'));
  }
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  runPreparedChecks({ skipTypeScript: process.argv.includes('--skip-typescript') }).catch(
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  );
}
