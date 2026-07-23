import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CommandFailure } from './errors.mjs';
import { projectRoot } from './repository.mjs';
import { describePlatform } from './platform.mjs';

const parentPackages = {
  rolldown: 'node_modules/rolldown',
  lightningcss: 'node_modules/lightningcss',
  esbuild: 'node_modules/esbuild'
};

const firstClassMatrix = [
  {
    os: 'android',
    cpu: 'arm64',
    rolldown: '@rolldown/binding-android-arm64',
    lightningcss: 'lightningcss-android-arm64',
    esbuild: '@esbuild/android-arm64'
  },
  {
    os: 'darwin',
    cpu: 'arm64',
    rolldown: '@rolldown/binding-darwin-arm64',
    lightningcss: 'lightningcss-darwin-arm64',
    esbuild: '@esbuild/darwin-arm64'
  },
  {
    os: 'darwin',
    cpu: 'x64',
    rolldown: '@rolldown/binding-darwin-x64',
    lightningcss: 'lightningcss-darwin-x64',
    esbuild: '@esbuild/darwin-x64'
  },
  {
    os: 'linux',
    cpu: 'arm64',
    libc: 'glibc',
    rolldown: '@rolldown/binding-linux-arm64-gnu',
    lightningcss: 'lightningcss-linux-arm64-gnu',
    esbuild: '@esbuild/linux-arm64'
  },
  {
    os: 'linux',
    cpu: 'x64',
    libc: 'glibc',
    rolldown: '@rolldown/binding-linux-x64-gnu',
    lightningcss: 'lightningcss-linux-x64-gnu',
    esbuild: '@esbuild/linux-x64'
  },
  {
    os: 'win32',
    cpu: 'arm64',
    rolldown: '@rolldown/binding-win32-arm64-msvc',
    lightningcss: 'lightningcss-win32-arm64-msvc',
    esbuild: '@esbuild/win32-arm64'
  },
  {
    os: 'win32',
    cpu: 'x64',
    rolldown: '@rolldown/binding-win32-x64-msvc',
    lightningcss: 'lightningcss-win32-x64-msvc',
    esbuild: '@esbuild/win32-x64'
  }
];

export const requiredNativePackages = firstClassMatrix.flatMap((candidate) =>
  Object.entries(parentPackages).map(([kind, parent]) => ({
    kind,
    parent,
    name: candidate[kind],
    os: candidate.os,
    cpu: candidate.cpu,
    ...(candidate.libc ? { libc: candidate.libc } : {})
  }))
);

function packageMap(lock) {
  if (!lock || typeof lock !== 'object' || lock.lockfileVersion !== 3) {
    throw new CommandFailure('package-lock.json must use lockfileVersion 3');
  }
  if (!lock.packages || typeof lock.packages !== 'object') {
    throw new CommandFailure('package-lock.json is missing the packages map');
  }
  return lock.packages;
}

function requireWorkspaceCoverage(packages) {
  const workspaces = packages['']?.workspaces;
  if (!Array.isArray(workspaces)) {
    throw new CommandFailure('package-lock.json root metadata is missing workspaces');
  }
  for (const required of ['apps/*', 'packages/*']) {
    if (!workspaces.includes(required)) {
      throw new CommandFailure(`package-lock.json workspaces must include ${required}`);
    }
  }
}

function requirePublicRegistry(packages) {
  for (const [name, metadata] of Object.entries(packages)) {
    const resolved = metadata?.resolved;
    if (typeof resolved !== 'string' || !resolved.startsWith('http')) continue;
    let host;
    try {
      host = new URL(resolved).hostname;
    } catch (error) {
      throw new CommandFailure(`Invalid resolved URL for ${name || '<root>'}: ${resolved}`, {
        cause: error
      });
    }
    if (host !== 'registry.npmjs.org') {
      throw new CommandFailure(`Unexpected package registry host for ${name || '<root>'}: ${host}`);
    }
  }
}

function includesValue(value, expected) {
  return Array.isArray(value) ? value.includes(expected) : value === expected;
}

function validateNativeEntry(packages, requirement) {
  const parent = packages[requirement.parent];
  if (!parent || typeof parent !== 'object') {
    throw new CommandFailure(`package-lock.json is missing ${requirement.parent}`);
  }
  const expectedVersion = parent.optionalDependencies?.[requirement.name];
  if (typeof expectedVersion !== 'string' || expectedVersion.length === 0) {
    throw new CommandFailure(
      `${requirement.parent} does not advertise optional dependency ${requirement.name}`
    );
  }
  const child = packages[`node_modules/${requirement.name}`];
  if (!child || typeof child !== 'object') {
    throw new CommandFailure(`package-lock.json is missing native package ${requirement.name}`);
  }
  if (child.version !== expectedVersion) {
    throw new CommandFailure(
      `${requirement.name} version ${child.version ?? '<missing>'} does not match ${expectedVersion}`
    );
  }
  if (!includesValue(child.os, requirement.os) || !includesValue(child.cpu, requirement.cpu)) {
    throw new CommandFailure(
      `${requirement.name} metadata does not match ${requirement.os} ${requirement.cpu}`
    );
  }
  if (child.optional !== true && child.devOptional !== true) {
    throw new CommandFailure(`${requirement.name} must be marked optional in package-lock.json`);
  }
}

export function validateLockfileObject(lock) {
  const packages = packageMap(lock);
  requireWorkspaceCoverage(packages);
  requirePublicRegistry(packages);
  for (const requirement of requiredNativePackages) {
    validateNativeEntry(packages, requirement);
  }
  return lock;
}

export async function readLockfile(path = join(projectRoot, 'package-lock.json')) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new CommandFailure(`Unable to read package-lock.json at ${path}`, { cause: error });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CommandFailure('package-lock.json is not valid JSON', { cause: error });
  }
}

function matchesHostMetadata(metadata, platformInfo) {
  return (
    includesValue(metadata.os, platformInfo.platform) &&
    includesValue(metadata.cpu, platformInfo.arch)
  );
}

function matchesLibc(name, kind, platformInfo) {
  if (platformInfo.platform !== 'linux' || kind === 'esbuild') return true;
  if (platformInfo.libc === 'glibc') return name.includes('-gnu');
  if (platformInfo.libc === 'musl') return name.includes('-musl');
  return false;
}

function selectOne(packages, kind, parentPath, platformInfo) {
  const parent = packages[parentPath];
  const optionalDependencies = parent?.optionalDependencies;
  if (!optionalDependencies || typeof optionalDependencies !== 'object') {
    throw new CommandFailure(`${parentPath} has no optional native dependency inventory`);
  }

  const matches = Object.keys(optionalDependencies).filter((name) => {
    const metadata = packages[`node_modules/${name}`];
    return (
      metadata &&
      matchesHostMetadata(metadata, platformInfo) &&
      matchesLibc(name, kind, platformInfo)
    );
  });
  if (matches.length !== 1) {
    throw new CommandFailure(
      `Unable to select exactly one ${kind} native package for ${describePlatform(platformInfo)}; found ${matches.length}`
    );
  }
  const name = matches[0];
  const expectedVersion = optionalDependencies[name];
  const metadata = packages[`node_modules/${name}`];
  if (metadata.version !== expectedVersion) {
    throw new CommandFailure(
      `${name} version ${metadata.version ?? '<missing>'} does not match ${expectedVersion}`
    );
  }
  if (metadata.optional !== true && metadata.devOptional !== true) {
    throw new CommandFailure(`${name} must be marked optional in package-lock.json`);
  }
  return name;
}

export function selectHostNativePackages(lock, platformInfo) {
  const packages = packageMap(lock);
  try {
    return {
      rolldown: selectOne(packages, 'rolldown', parentPackages.rolldown, platformInfo),
      lightningcss: selectOne(packages, 'lightningcss', parentPackages.lightningcss, platformInfo),
      esbuild: selectOne(packages, 'esbuild', parentPackages.esbuild, platformInfo)
    };
  } catch (error) {
    if (error instanceof CommandFailure) {
      throw new CommandFailure(
        `${error.message}. Detected platform: ${describePlatform(platformInfo)}`,
        { cause: error }
      );
    }
    throw error;
  }
}
