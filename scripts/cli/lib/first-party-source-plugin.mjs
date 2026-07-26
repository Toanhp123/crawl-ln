import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { importFrom } from './module-loader.mjs';

const FIXED_ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');
const PACKAGE_FILES = ['checksums.json', 'dist/index.js', 'manifest.json'];
const SAFE_PLUGIN_ID = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const BARE_IMPORT = /(?:from\s+|import\()\s*['"](?![./])/;

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${label}`, { cause: error });
  }
}

async function defaultBundle({ root, workspaceRoot, outfile }) {
  const module = await importFrom(workspaceRoot, 'esbuild');
  const esbuild = module.default ?? module;
  await esbuild.build({
    entryPoints: [join(workspaceRoot, 'src', 'index.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'silent',
    alias: {
      '@novel-tool/source-plugin-sdk': join(
        root,
        'packages',
        'source-plugin-sdk',
        'src',
        'index.ts'
      )
    }
  });
}

function assertPackageIdentity(packageJson, manifest) {
  if (!SAFE_PLUGIN_ID.test(String(manifest?.id ?? ''))) {
    throw new Error('First-party plugin manifest id is invalid');
  }
  if (!SAFE_VERSION.test(String(manifest?.version ?? ''))) {
    throw new Error('First-party plugin manifest version is invalid');
  }
  if (packageJson?.version !== manifest.version) {
    throw new Error('First-party plugin package and manifest versions must match');
  }
  if (manifest?.runtime?.preferredMode !== 'isolated') {
    throw new Error('First-party external plugins must prefer isolated execution');
  }
}

async function readBundledEntry(compileDirectory) {
  const entries = await readdir(compileDirectory, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0]?.isFile() || entries[0].name !== 'index.js') {
    throw new Error('First-party plugin compilation must emit exactly index.js');
  }
  const entry = await readFile(join(compileDirectory, 'index.js'));
  if (BARE_IMPORT.test(entry.toString('utf8'))) {
    throw new Error('First-party plugin bundle contains a bare module import');
  }
  return entry;
}

async function createArchive(root, files) {
  const module = await importFrom(join(root, 'apps', 'api'), 'jszip');
  const JSZip = module.default ?? module;
  const zip = new JSZip();
  for (const path of [...files.keys()].sort()) {
    zip.file(path, files.get(path), {
      date: FIXED_ZIP_DATE,
      unixPermissions: 0o100644,
      createFolders: false
    });
  }
  return zip.generateAsync({
    type: 'uint8array',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });
}

function assertVerifiedPackage(verified, manifest) {
  if (
    verified?.signatureStatus !== 'unsigned' ||
    verified?.trustLevel !== 'local-unverified' ||
    verified?.executionMode !== 'isolated'
  ) {
    throw new Error('First-party plugin verifier returned an unexpected trust classification');
  }
  if (verified.manifest?.id !== manifest.id || verified.manifest?.version !== manifest.version) {
    throw new Error('First-party plugin verifier returned a different manifest identity');
  }
  if ([...verified.files.keys()].sort().join('\n') !== PACKAGE_FILES.join('\n')) {
    throw new Error('First-party plugin verifier returned an unexpected file inventory');
  }
}

export async function packageFirstPartySourcePlugin({
  root,
  workspaceRoot,
  outputDirectory,
  verifier,
  bundle = defaultBundle
}) {
  if (!verifier || typeof verifier.verify !== 'function') {
    throw new Error('First-party plugin packaging requires the production verifier');
  }

  const absoluteRoot = resolve(root);
  const absoluteWorkspace = resolve(workspaceRoot);
  const absoluteOutput = resolve(outputDirectory);
  const stagingRoot = join(dirname(absoluteOutput), `.source-plugin-staging-${randomUUID()}`);
  const compileDirectory = join(stagingRoot, 'compile');
  let temporaryArtifact;

  await mkdir(compileDirectory, { recursive: true });
  try {
    const [packageJson, manifest] = await Promise.all([
      readJson(join(absoluteWorkspace, 'package.json'), 'first-party plugin package.json'),
      readJson(join(absoluteWorkspace, 'manifest.json'), 'first-party plugin manifest.json')
    ]);
    assertPackageIdentity(packageJson, manifest);

    await bundle({
      root: absoluteRoot,
      workspaceRoot: absoluteWorkspace,
      outfile: join(compileDirectory, 'index.js')
    });
    const entryBytes = await readBundledEntry(compileDirectory);
    const manifestBytes = jsonBytes(manifest);
    const packageFiles = new Map([
      ['dist/index.js', entryBytes],
      ['manifest.json', manifestBytes]
    ]);
    const checksums = Object.fromEntries(
      [...packageFiles.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([path, content]) => [path, sha256(content)])
    );
    packageFiles.set('checksums.json', jsonBytes(checksums));

    const bytes = await createArchive(absoluteRoot, packageFiles);
    const verified = await verifier.verify(bytes);
    assertVerifiedPackage(verified, manifest);

    await mkdir(absoluteOutput, { recursive: true });
    const artifactName = `${manifest.id}-${manifest.version}.source-plugin`;
    const artifactPath = join(absoluteOutput, artifactName);
    temporaryArtifact = join(absoluteOutput, `.${artifactName}.${randomUUID()}.tmp`);
    await writeFile(temporaryArtifact, bytes, { flag: 'wx' });
    await rename(temporaryArtifact, artifactPath);
    temporaryArtifact = undefined;
    return { artifactPath, bytes, verified };
  } finally {
    if (temporaryArtifact) await rm(temporaryArtifact, { force: true });
    await rm(stagingRoot, { recursive: true, force: true });
  }
}
