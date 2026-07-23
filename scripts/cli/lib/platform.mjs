import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CommandFailure } from './errors.mjs';
import { currentNpmCli } from './npm.mjs';

const execFileAsync = promisify(execFile);
const MINIMUM_NODE_VERSION = '22.12.0';
const MINIMUM_NPM_VERSION = '10.0.0';

export const FIRST_CLASS_PLATFORMS = [
  { platform: 'win32', arch: 'x64' },
  { platform: 'win32', arch: 'arm64' },
  { platform: 'darwin', arch: 'x64' },
  { platform: 'darwin', arch: 'arm64' },
  { platform: 'linux', arch: 'x64', libc: 'glibc' },
  { platform: 'linux', arch: 'arm64', libc: 'glibc' },
  { platform: 'android', arch: 'arm64' }
];

function numericVersion(version) {
  const match = String(version)
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    throw new CommandFailure(`Unable to parse runtime version "${version}"`);
  }
  return match.slice(1).map(Number);
}

function isVersionAtLeast(actual, minimum) {
  const actualParts = numericVersion(actual);
  const minimumParts = numericVersion(minimum);
  for (let index = 0; index < minimumParts.length; index += 1) {
    if (actualParts[index] > minimumParts[index]) return true;
    if (actualParts[index] < minimumParts[index]) return false;
  }
  return true;
}

export function validateRuntime({ nodeVersion, npmVersion }) {
  if (!isVersionAtLeast(nodeVersion, MINIMUM_NODE_VERSION)) {
    throw new CommandFailure(
      `Node.js ${MINIMUM_NODE_VERSION} or newer is required; detected ${nodeVersion}`
    );
  }
  if (!isVersionAtLeast(npmVersion, MINIMUM_NPM_VERSION)) {
    throw new CommandFailure(
      `npm ${MINIMUM_NPM_VERSION} or newer is required; detected ${npmVersion}`
    );
  }
  return { nodeVersion, npmVersion };
}

export async function readNpmVersion(environment = process.env) {
  const npmCli = currentNpmCli(environment);
  try {
    const { stdout } = await execFileAsync(process.execPath, [npmCli, '--version'], {
      env: environment,
      windowsHide: true,
      encoding: 'utf8'
    });
    return stdout.trim();
  } catch (error) {
    throw new CommandFailure('Unable to read the npm version through the active npm CLI', {
      cause: error
    });
  }
}

export async function validateRuntimeEnvironment({ environment = process.env } = {}) {
  return validateRuntime({
    nodeVersion: process.version,
    npmVersion: await readNpmVersion(environment)
  });
}

function reportHeader(report) {
  return report && typeof report === 'object' && report.header ? report.header : {};
}

function detectLinuxLibc(report) {
  const header = reportHeader(report);
  if (header.glibcVersionRuntime) {
    return { libc: 'glibc', glibcVersion: header.glibcVersionRuntime };
  }
  const sharedObjects = Array.isArray(report?.sharedObjects) ? report.sharedObjects : [];
  if (sharedObjects.some((value) => /(?:ld-musl-|libc\.musl-)/i.test(String(value)))) {
    return { libc: 'musl' };
  }
  return { libc: 'unknown' };
}

export function detectPlatform({
  platform = process.platform,
  arch = process.arch,
  report = process.report?.getReport?.()
} = {}) {
  const libcInfo = platform === 'linux' ? detectLinuxLibc(report) : {};
  return validateSupportedPlatform({ platform, arch, ...libcInfo });
}

export function validateSupportedPlatform(input) {
  const platform = input.platform;
  const arch = input.arch;
  const libc =
    platform === 'linux' ? (input.libc ?? (input.glibcVersion ? 'glibc' : 'unknown')) : undefined;
  const detected = {
    platform,
    arch,
    ...(libc ? { libc } : {}),
    ...(input.glibcVersion ? { glibcVersion: input.glibcVersion } : {})
  };

  if (platform === 'android' && arch !== 'arm64') {
    throw new CommandFailure(
      `Unsupported platform combination: ${platform} ${arch}. Android requires ARM64 for the current Rolldown toolchain.`
    );
  }

  const firstClass = FIRST_CLASS_PLATFORMS.some(
    (candidate) =>
      candidate.platform === platform &&
      candidate.arch === arch &&
      (candidate.libc === undefined || candidate.libc === libc)
  );
  return { ...detected, support: firstClass ? 'first-class' : 'best-effort' };
}

export function describePlatform(platformInfo) {
  return [platformInfo.platform, platformInfo.arch, platformInfo.libc].filter(Boolean).join(' ');
}
