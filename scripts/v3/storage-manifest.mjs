import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function portablePath(path) {
  return path.split(sep).join('/');
}

export async function sha256File(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function listFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Storage manifests do not allow symbolic links: ${path}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, path)));
      continue;
    }
    if (!entry.isFile()) throw new Error(`Unsupported storage entry: ${path}`);
    const stat = await lstat(path);
    files.push({
      path: portablePath(relative(root, path)),
      size: stat.size,
      sha256: await sha256File(path)
    });
  }

  return files;
}

export async function storageManifest(path) {
  const storagePath = resolve(path);
  const stat = await lstat(storagePath);
  if (!stat.isDirectory()) throw new Error(`Storage path is not a directory: ${storagePath}`);
  const files = await listFiles(storagePath);
  return {
    formatVersion: 1,
    storagePath,
    files,
    sha256: sha256(JSON.stringify({ formatVersion: 1, files }))
  };
}

export async function findStorageDatabase(path) {
  const manifest = await storageManifest(path);
  const canonical = manifest.files.find((file) => file.path === 'novel-tool.sqlite');
  if (canonical) return join(manifest.storagePath, ...canonical.path.split('/'));

  const databases = manifest.files.filter(
    (file) => file.path.endsWith('.sqlite') && !basename(file.path).startsWith('.')
  );
  if (databases.length !== 1) {
    throw new Error(
      `Expected one storage database or novel-tool.sqlite, found ${databases.length} in ${manifest.storagePath}`
    );
  }
  return join(manifest.storagePath, ...databases[0].path.split('/'));
}
