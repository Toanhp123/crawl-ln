import { cp, lstat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function isInside(root, path) {
  const child = relative(resolve(root), resolve(path));
  return child === '' || (!child.startsWith('..') && !isAbsolute(child));
}

function repositoryPath(root, path) {
  const absolute = resolve(root, path);
  const child = relative(root, absolute);
  if (child === '' || child.startsWith('..') || isAbsolute(child)) {
    throw new Error(`Repository snapshot path escapes the repository: ${path}`);
  }
  return { absolute, child };
}

function mutationPaths(root, paths) {
  const candidates = [...new Set(paths)]
    .map((path) => repositoryPath(root, path))
    .sort((left, right) => left.child.length - right.child.length);
  const kept = [];
  for (const candidate of candidates) {
    if (kept.some((entry) => isInside(entry.absolute, candidate.absolute))) continue;
    kept.push(candidate);
  }
  return kept;
}

export async function createRepositoryPathSnapshot(root, paths, { backupParent = tmpdir() } = {}) {
  const repositoryRoot = resolve(root);
  const resolvedBackupParent = resolve(backupParent);
  if (isInside(repositoryRoot, resolvedBackupParent)) {
    throw new Error('Repository snapshot backup must be outside the repository');
  }
  await mkdir(resolvedBackupParent, { recursive: true });
  const backupRoot = await mkdtemp(join(resolvedBackupParent, 'novel-tool-v3-removal-'));
  const entries = [];
  try {
    for (const entry of mutationPaths(repositoryRoot, paths)) {
      const existed = await pathExists(entry.absolute);
      const backupPath = join(backupRoot, entry.child);
      if (existed) {
        await mkdir(dirname(backupPath), { recursive: true });
        await cp(entry.absolute, backupPath, {
          recursive: true,
          force: false,
          errorOnExist: true
        });
      }
      entries.push({ ...entry, existed, backupPath });
    }
    return { backupRoot, entries };
  } catch (error) {
    await rm(backupRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreRepositoryPathSnapshot(snapshot) {
  const errors = [];
  for (const entry of [...snapshot.entries].sort(
    (left, right) => right.child.length - left.child.length
  )) {
    try {
      await rm(entry.absolute, { recursive: true, force: true });
    } catch (error) {
      errors.push(error);
    }
  }
  for (const entry of snapshot.entries) {
    if (!entry.existed) continue;
    try {
      await mkdir(dirname(entry.absolute), { recursive: true });
      await cp(entry.backupPath, entry.absolute, {
        recursive: true,
        force: false,
        errorOnExist: true
      });
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Repository path snapshot recovery failed');
  }
}

export async function discardRepositoryPathSnapshot(snapshot) {
  await rm(snapshot.backupRoot, { recursive: true, force: true });
}
