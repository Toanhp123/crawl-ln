import { lstat, readdir, realpath } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { SourceReaderError } from '../../../domain/errors/source-reader.error.js';

const allowedSourceExtensions = new Set(['.js', '.mjs', '.json']);

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function violation(message: string): never {
  throw new SourceReaderError('PLUGIN_SANDBOX_POLICY_VIOLATION', message, {
    retryable: false,
    fallbackAllowed: false
  });
}

export async function validateSandboxPackage(input: {
  packageRoot: string;
  entryPath: string;
}): Promise<{ packageRoot: string; entryPath: string }> {
  const root = await realpath(input.packageRoot).catch(() =>
    violation('Plugin package is unavailable')
  );
  const entry = await realpath(input.entryPath).catch(() =>
    violation('Plugin entry is unavailable')
  );
  if (!inside(root, entry)) violation('Plugin entry escapes package root');
  if (!allowedSourceExtensions.has(extname(entry))) violation('Plugin entry type is forbidden');

  const visit = async (directory: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      const candidate = resolve(directory, name);
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink()) {
        const target = await realpath(candidate).catch(() =>
          violation('Plugin symlink is invalid')
        );
        if (!inside(root, target)) violation('Plugin symlink escapes package root');
        continue;
      }
      if (stat.isDirectory()) {
        await visit(candidate);
        continue;
      }
      if (!stat.isFile()) violation('Plugin package contains an unsupported filesystem entry');
      const extension = extname(candidate).toLowerCase();
      if (extension === '.node') violation('Native addons are forbidden');
      if (!allowedSourceExtensions.has(extension))
        violation('Plugin package contains a forbidden file');
      if ((stat.mode & 0o111) !== 0) violation('Executable plugin files are forbidden');
    }
  };

  await visit(root);
  return { packageRoot: root, entryPath: entry };
}
