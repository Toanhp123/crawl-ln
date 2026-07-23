import { readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import { CommandFailure } from './errors.mjs';

export const BUILD_MANIFEST_FORMAT_VERSION = 1;
export const REQUIRED_RUNTIME_PACKAGES = ['@novel-tool/shared', '@novel-tool/source-plugin-sdk'];

function failure(message, options) {
  return new CommandFailure(`Build manifest ${message}`, options);
}

function safeRelativePath(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw failure(`${label} must be a non-empty safe relative path`);
  }
  if (isAbsolute(value)) throw failure(`${label} must be a safe relative path`);
  const normalized = normalize(value);
  if (
    normalized === '..' ||
    normalized.startsWith(`..${sep}`) ||
    normalized.includes(`${sep}..${sep}`)
  ) {
    throw failure(`${label} must be a safe relative path`);
  }
  return normalized;
}

function resolveInside(root, value, label) {
  const relativePath = safeRelativePath(value, label);
  const absolute = resolve(root, relativePath);
  const fromRoot = relative(resolve(root), absolute);
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw failure(`${label} must resolve below the build root`);
  }
  return absolute;
}

async function requireFile(path, label) {
  let metadata;
  try {
    metadata = await stat(path);
  } catch (error) {
    throw failure(`${label} is missing: ${path}`, { cause: error });
  }
  if (!metadata.isFile()) throw failure(`${label} is not a file: ${path}`);
}

async function requireDirectory(path, label) {
  let metadata;
  try {
    metadata = await stat(path);
  } catch (error) {
    throw failure(`${label} is missing: ${path}`, { cause: error });
  }
  if (!metadata.isDirectory()) throw failure(`${label} is not a directory: ${path}`);
}

function validateShape(manifest, expectedApplicationVersion) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw failure('must contain a JSON object');
  }
  if (manifest.formatVersion !== BUILD_MANIFEST_FORMAT_VERSION) {
    throw failure(`format version must be ${BUILD_MANIFEST_FORMAT_VERSION}`);
  }
  if (manifest.complete !== true) throw failure('must be complete');
  if (typeof manifest.applicationVersion !== 'string' || manifest.applicationVersion === '') {
    throw failure('applicationVersion must be a non-empty string');
  }
  if (
    expectedApplicationVersion !== undefined &&
    manifest.applicationVersion !== expectedApplicationVersion
  ) {
    throw failure(`does not match application version ${expectedApplicationVersion}`);
  }
  if (typeof manifest.buildId !== 'string' || manifest.buildId.trim() === '') {
    throw failure('buildId must be a non-empty string');
  }
  if (!manifest.runtimePackages || typeof manifest.runtimePackages !== 'object') {
    throw failure('runtimePackages must be an object');
  }
  const names = Object.keys(manifest.runtimePackages).sort();
  const expected = [...REQUIRED_RUNTIME_PACKAGES].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw failure(`runtimePackages must contain exactly ${expected.join(', ')}`);
  }
  return manifest;
}

export async function validateBuildManifest(root, manifest, expectedApplicationVersion) {
  const value = validateShape(manifest, expectedApplicationVersion);
  const serverEntry = resolveInside(root, value.serverEntry, 'serverEntry');
  const publicDirectory = resolveInside(root, value.publicDirectory, 'publicDirectory');
  await requireFile(serverEntry, 'server entry');
  await requireDirectory(publicDirectory, 'public directory');
  await requireFile(join(publicDirectory, 'index.html'), 'public index');

  const runtimePackages = {};
  for (const name of REQUIRED_RUNTIME_PACKAGES) {
    const packageRoot = resolveInside(root, value.runtimePackages[name], `runtime package ${name}`);
    await requireDirectory(packageRoot, `runtime package ${name}`);
    await requireFile(join(packageRoot, 'package.json'), `runtime package ${name} package.json`);
    await requireFile(join(packageRoot, 'dist', 'index.js'), `runtime package ${name} entry`);
    runtimePackages[name] = packageRoot;
  }

  return {
    root: resolve(root),
    manifest: value,
    serverEntry,
    publicDirectory,
    runtimePackages
  };
}

export async function writeBuildManifest(root, manifest) {
  await validateBuildManifest(root, manifest, manifest.applicationVersion);
  await writeFile(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function readStartableBuild(root, expectedApplicationVersion) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  } catch (error) {
    throw failure(`cannot be read from ${join(root, 'manifest.json')}`, {
      cause: error
    });
  }
  return validateBuildManifest(root, manifest, expectedApplicationVersion);
}
