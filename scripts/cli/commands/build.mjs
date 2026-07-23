import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { runApiBuild } from '../../../apps/api/scripts/build.mjs';
import { parseOptions } from '../lib/arguments.mjs';
import { promoteDirectory } from '../lib/atomic-directory.mjs';
import { readStartableBuild, writeBuildManifest } from '../lib/build-manifest.mjs';
import { prepareInternalPackages } from '../lib/internal-packages.mjs';
import { importFrom } from '../lib/module-loader.mjs';
import { projectRoot } from '../lib/repository.mjs';

const execFileAsync = promisify(execFile);

function helpText() {
  return [
    'Usage: node scripts/cli.mjs build [--target <api|web>]',
    '',
    'Build one atomic production artifact containing the server and web assets.',
    '',
    'Options:',
    '  --target <api|web>  Build only one diagnostic workspace target',
    '  --help              Show this help'
  ].join('\n');
}

async function readPackage(root) {
  return JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
}

async function deriveBuildId(root, environment = process.env) {
  if (environment.APP_BUILD) return environment.APP_BUILD;
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      encoding: 'utf8'
    });
    const value = stdout.trim();
    if (value) return value;
  } catch {
    // Extracted checkpoints intentionally have no Git metadata.
  }
  return (await readPackage(root)).version;
}

async function copyRuntimePackage(root, name, destination) {
  const packageRoot = join(root, 'packages', name);
  await mkdir(destination, { recursive: true });
  await cp(join(packageRoot, 'package.json'), join(destination, 'package.json'));
  await cp(join(packageRoot, 'dist'), join(destination, 'dist'), {
    recursive: true
  });
}

async function defaultBuildWeb({ root, outDir, buildId }) {
  const webRoot = join(root, 'apps', 'web');
  const vite = await importFrom(webRoot, 'vite');
  const previous = process.env.APP_BUILD;
  process.env.APP_BUILD = buildId;
  try {
    await vite.build({
      root: webRoot,
      build: { outDir, emptyOutDir: true }
    });
  } finally {
    if (previous === undefined) delete process.env.APP_BUILD;
    else process.env.APP_BUILD = previous;
  }
}

export async function buildFullApplication({
  root = projectRoot,
  distRoot = join(root, 'dist'),
  buildId,
  prepare = prepareInternalPackages,
  buildApi = ({ apiRoot, outputRoot }) => runApiBuild({ apiRoot, outputRoot }),
  buildWeb = defaultBuildWeb
} = {}) {
  const applicationVersion = (await readPackage(root)).version;
  const resolvedBuildId = buildId ?? (await deriveBuildId(root));
  const parent = dirname(resolve(distRoot));
  const stage = join(parent, `.${basename(distRoot)}-staging-${randomUUID()}`);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  try {
    await prepare(['shared', 'sdk', 'reader-engine'], root);
    await buildApi({
      apiRoot: join(root, 'apps', 'api'),
      outputRoot: join(stage, 'server')
    });
    const runtimeRoot = join(stage, 'server', 'node_modules', '@novel-tool');
    await copyRuntimePackage(root, 'shared', join(runtimeRoot, 'shared'));
    await copyRuntimePackage(root, 'source-plugin-sdk', join(runtimeRoot, 'source-plugin-sdk'));
    await buildWeb({
      root,
      outDir: join(stage, 'public'),
      buildId: resolvedBuildId
    });
    await writeBuildManifest(stage, {
      formatVersion: 1,
      applicationVersion,
      buildId: resolvedBuildId,
      complete: true,
      serverEntry: 'server/server.js',
      publicDirectory: 'public',
      runtimePackages: {
        '@novel-tool/shared': 'server/node_modules/@novel-tool/shared',
        '@novel-tool/source-plugin-sdk': 'server/node_modules/@novel-tool/source-plugin-sdk'
      }
    });
    await readStartableBuild(stage, applicationVersion);
    await promoteDirectory({ target: distRoot, stage });
    return readStartableBuild(distRoot, applicationVersion);
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

async function buildTarget(target, root = projectRoot) {
  if (target === 'api') {
    await prepareInternalPackages(['shared', 'sdk'], root);
    await runApiBuild({
      apiRoot: join(root, 'apps', 'api'),
      outputRoot: join(root, 'apps', 'api', 'dist')
    });
    return;
  }
  await prepareInternalPackages(['shared', 'reader-engine'], root);
  await defaultBuildWeb({
    root,
    outDir: join(root, 'apps', 'web', 'dist'),
    buildId: await deriveBuildId(root)
  });
}

export const buildCommand = {
  name: 'build',
  summary: 'Build an atomic production artifact',
  async execute(argv, context = {}) {
    const { help, values } = parseOptions('build', argv, {
      target: { type: 'string', choices: ['api', 'web'] }
    });
    if (help) {
      (context.stdout ?? console.log)(helpText());
      return;
    }
    if (values.target) return buildTarget(values.target);
    return buildFullApplication();
  }
};
