import { access, readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const SAFE_PLUGIN_ID = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

async function readJson(path, label, workspaceRoot) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    const detail = error?.code === 'ENOENT' ? `${label} is required` : `could not be read`;
    throw new Error(`Invalid source plugin workspace ${workspaceRoot}: ${detail}`, {
      cause: error
    });
  }
}

function invalid(workspaceRoot, message) {
  throw new Error(`Invalid source plugin workspace ${workspaceRoot}: ${message}`);
}

async function optionalFile(path) {
  try {
    await access(path);
    return path;
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Discover direct plugin workspaces without embedding a provider identity in command code.
 */
export async function discoverSourcePluginWorkspaces(root) {
  const repositoryRoot = resolve(root);
  const pluginsRoot = join(repositoryRoot, 'plugins');
  let entries;
  try {
    entries = await readdir(pluginsRoot, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const directories = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const workspaces = [];
  const ids = new Set();
  const identities = new Set();

  for (const entry of directories) {
    const workspaceRoot = join(pluginsRoot, entry.name);
    const packageJsonPath = join(workspaceRoot, 'package.json');
    const manifestPath = join(workspaceRoot, 'manifest.json');
    const packageJson = await readJson(
      packageJsonPath,
      'package.json',
      relative(repositoryRoot, workspaceRoot)
    );
    const manifest = await readJson(
      manifestPath,
      'manifest.json',
      relative(repositoryRoot, workspaceRoot)
    );

    if (typeof packageJson?.name !== 'string' || packageJson.name.trim() === '') {
      invalid(relative(repositoryRoot, workspaceRoot), 'package name is invalid');
    }
    if (!SAFE_PLUGIN_ID.test(String(manifest?.id ?? ''))) {
      invalid(relative(repositoryRoot, workspaceRoot), 'manifest id is invalid');
    }
    if (!SAFE_VERSION.test(String(manifest?.version ?? ''))) {
      invalid(relative(repositoryRoot, workspaceRoot), 'manifest version is invalid');
    }
    if (packageJson.version !== manifest.version) {
      invalid(relative(repositoryRoot, workspaceRoot), 'package and manifest versions must match');
    }

    const id = manifest.id;
    const version = manifest.version;
    const identity = `${id}@${version}`;
    if (identities.has(identity)) {
      invalid(
        relative(repositoryRoot, workspaceRoot),
        `duplicate source plugin artifact: ${identity}`
      );
    }
    if (ids.has(id))
      invalid(relative(repositoryRoot, workspaceRoot), `duplicate source plugin id: ${id}`);
    ids.add(id);
    identities.add(identity);

    workspaces.push({
      id,
      version,
      workspaceName: packageJson.name,
      workspaceRoot: resolve(workspaceRoot),
      packageJsonPath: resolve(packageJsonPath),
      manifestPath: resolve(manifestPath),
      tsconfigPath: await optionalFile(join(workspaceRoot, 'tsconfig.json')),
      distPath: resolve(join(workspaceRoot, 'dist')),
      packageJson,
      manifest
    });
  }

  return workspaces.sort(
    (left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version)
  );
}
