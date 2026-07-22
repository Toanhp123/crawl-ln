import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildLegacyDependencyInventory,
  scanLegacyReferences,
  validateCoverageMatrix
} from './legacy-dependency-inventory.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const apiLegacyRole = ['api', 'legacy'].join('-');
const webLegacyRole = ['web', 'legacy'].join('-');
const legacyRoles = [apiLegacyRole, webLegacyRole];
const acceptanceFields = [
  'formatVersion',
  'commit',
  'canonicalCandidateSha256',
  'approvedBy',
  'approvedAt',
  'legacyRemovalApproved'
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function readJsonWithBytes(path) {
  const bytes = await readFile(resolve(path));
  return { bytes, value: JSON.parse(bytes.toString('utf8')) };
}

function validateAcceptanceShape(acceptance, currentCommit) {
  if (!acceptance || typeof acceptance !== 'object' || Array.isArray(acceptance)) {
    throw new Error('A release acceptance record is required');
  }
  const actualFields = Object.keys(acceptance).sort();
  const expectedFields = [...acceptanceFields].sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index])
  ) {
    throw new Error('Release acceptance fields do not match the locked schema');
  }
  if (acceptance.formatVersion !== 1) throw new Error('Release acceptance format is invalid');
  if (!COMMIT.test(acceptance.commit ?? '') || acceptance.commit !== currentCommit) {
    throw new Error('Release acceptance commit does not match HEAD');
  }
  if (!SHA256.test(acceptance.canonicalCandidateSha256 ?? '')) {
    throw new Error('Release acceptance canonical candidate hash is invalid');
  }
  if (typeof acceptance.approvedBy !== 'string' || acceptance.approvedBy.trim().length === 0) {
    throw new Error('Release acceptance approver is missing');
  }
  if (!Number.isFinite(Date.parse(acceptance.approvedAt ?? ''))) {
    throw new Error('Release acceptance timestamp is invalid');
  }
  if (acceptance.legacyRemovalApproved !== true) {
    throw new Error('Legacy removal is not approved');
  }
}

async function validateEvidence({
  acceptance,
  currentCommit,
  canonicalCandidatePath,
  rollbackRehearsalPath
}) {
  validateAcceptanceShape(acceptance, currentCommit);
  const canonical = await readJsonWithBytes(canonicalCandidatePath);
  if (sha256(canonical.bytes) !== acceptance.canonicalCandidateSha256) {
    throw new Error('Release acceptance does not match the canonical candidate artifact');
  }
  if (canonical.value?.formatVersion !== 1 || canonical.value.commit !== currentCommit) {
    throw new Error('Canonical candidate commit does not match HEAD');
  }
  if (
    canonical.value.passed !== true ||
    !Array.isArray(canonical.value.commands) ||
    canonical.value.commands.length === 0 ||
    canonical.value.commands.some((command) => command?.passed !== true)
  ) {
    throw new Error('Canonical candidate verification did not pass');
  }
  if (!SHA256.test(canonical.value.rollbackRehearsalSha256 ?? '')) {
    throw new Error('Canonical candidate rollback rehearsal hash is invalid');
  }

  const rollback = await readJsonWithBytes(rollbackRehearsalPath);
  if (sha256(rollback.bytes) !== canonical.value.rollbackRehearsalSha256) {
    throw new Error('Rollback rehearsal does not match the canonical candidate');
  }
  if (rollback.value?.formatVersion !== 1 || rollback.value.commit !== currentCommit) {
    throw new Error('Rollback rehearsal commit does not match HEAD');
  }
  if (rollback.value.sourceManifestRestored !== true || rollback.value.rollbackTriggered !== true) {
    throw new Error('Rollback rehearsal did not restore the source manifest');
  }
  for (const field of ['sourceManifestSha256', 'candidateManifestSha256']) {
    if (!SHA256.test(rollback.value[field] ?? '')) {
      throw new Error(`Rollback rehearsal ${field} is invalid`);
    }
  }
  return { canonical: canonical.value, rollback: rollback.value };
}

async function rewriteFile(path, transform) {
  if (!(await pathExists(path))) return false;
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) return false;
  await writeFile(path, after, 'utf8');
  return true;
}

async function rewritePackageJson(root) {
  const path = join(root, 'package.json');
  const packageJson = JSON.parse(await readFile(path, 'utf8'));
  const obsoleteScripts = new Set(['check:crawler', 'verify:v3:canonical']);
  for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
    if (
      obsoleteScripts.has(name) ||
      name.includes('legacy') ||
      legacyRoles.some((role) => String(command).includes(role))
    ) {
      delete packageJson.scripts[name];
    }
  }
  await writeFile(path, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

async function rewriteRepositorySurfaces(root, inventory) {
  await rewritePackageJson(root);
  const rewritten = ['package.json'];

  if (
    await rewriteFile(join(root, '.gitignore'), (source) =>
      source
        .split(/(?<=\n)/)
        .filter((line) => !legacyRoles.some((role) => line.includes(role)))
        .join('')
    )
  ) {
    rewritten.push('.gitignore');
  }

  if (
    await rewriteFile(join(root, 'scripts', 'check-prepared.mjs'), (source) =>
      source
        .split(/(?<=\n)/)
        .filter((line) => !line.includes('check-crawler-platform.mjs'))
        .join('')
    )
  ) {
    rewritten.push('scripts/check-prepared.mjs');
  }

  for (const file of ['scripts/clean.mjs', 'tests/regression/project-clean-command.test.ts']) {
    if (
      await rewriteFile(join(root, file), (source) =>
        source.replaceAll(apiLegacyRole, 'api').replaceAll(webLegacyRole, 'web')
      )
    ) {
      rewritten.push(file);
    }
  }

  if (
    await rewriteFile(join(root, 'playwright.config.ts'), (source) => {
      const escaped = webLegacyRole.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return source.replace(
        new RegExp(
          `\\n\\s*\\{\\n\\s*command: [^\\n]*${escaped}[^\\n]*\\n[\\s\\S]*?\\n\\s*\\},`,
          'g'
        ),
        ''
      );
    })
  ) {
    rewritten.push('playwright.config.ts');
  }

  const removedRegressionNames = inventory.deletePaths
    .filter((path) => path.startsWith('tests/regression/'))
    .map((path) => path.split('/').at(-1));
  if (
    await rewriteFile(join(root, 'scripts', 'run-test-files.mjs'), (source) =>
      source
        .split(/(?<=\n)/)
        .filter((line) => !removedRegressionNames.some((name) => line.includes(`'${name}'`)))
        .join('')
    )
  ) {
    rewritten.push('scripts/run-test-files.mjs');
  }

  return rewritten.sort();
}

function createNpmInvocation() {
  const args = ['install', '--package-lock-only', '--ignore-scripts'];
  if (process.env.npm_execpath) {
    return {
      command: process.env.npm_node_execpath ?? process.execPath,
      args: [process.env.npm_execpath, ...args]
    };
  }
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`]
    };
  }
  return { command: 'npm', args };
}

async function regeneratePackageLock(root) {
  const invocation = createNpmInvocation();
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: root,
      env: process.env,
      stdio: 'inherit'
    });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) return resolveRun();
      const reason = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
      rejectRun(new Error(`Package-lock regeneration failed with ${reason}`));
    });
  });
}

async function pruneRemovedLockfileEntries(root) {
  const path = join(root, 'package-lock.json');
  if (!(await pathExists(path))) return false;
  const lockfile = JSON.parse(await readFile(path, 'utf8'));
  let changed = false;
  for (const [path, entry] of Object.entries(lockfile.packages ?? {})) {
    if (
      legacyRoles.some((role) => path.includes(role) || String(entry?.name ?? '').includes(role))
    ) {
      delete lockfile.packages[path];
      changed = true;
    }
  }
  for (const name of Object.keys(lockfile.dependencies ?? {})) {
    if (legacyRoles.some((role) => name.includes(role))) {
      delete lockfile.dependencies[name];
      changed = true;
    }
  }
  if (changed) await writeFile(path, `${JSON.stringify(lockfile, null, 2)}\n`, 'utf8');
  return changed;
}

function isDeferredReference(path) {
  return (
    path === 'README.md' ||
    path === 'CHANGELOG.md' ||
    path.startsWith('docs/') ||
    path.startsWith('specs/checkpoints/') ||
    path.startsWith('specs/plans/') ||
    path === 'scripts/setup-termux.sh' ||
    path === 'scripts/termux-dev.sh'
  );
}

export async function findLegacyReferences(root = projectRoot) {
  const { referenceFiles } = await scanLegacyReferences(resolve(root));
  return referenceFiles.filter((path) => !isDeferredReference(path)).sort();
}

async function gitHead(root) {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8'
  });
  return stdout.trim();
}

export async function removeLegacyApps(
  root = projectRoot,
  acceptance,
  {
    currentCommit,
    canonicalCandidatePath = join(root, '.artifacts', 'v3', 'canonical-candidate.json'),
    rollbackRehearsalPath = join(root, '.artifacts', 'v3', 'rollback-rehearsal.json'),
    regenerateLockfile = () => regeneratePackageLock(root)
  } = {}
) {
  const resolvedRoot = resolve(root);
  const head = currentCommit ?? (await gitHead(resolvedRoot));
  await validateEvidence({
    acceptance,
    currentCommit: head,
    canonicalCandidatePath,
    rollbackRehearsalPath
  });
  const inventory = await buildLegacyDependencyInventory(resolvedRoot);

  const removedPaths = [];
  for (const path of inventory.deletePaths) {
    const absolute = resolve(resolvedRoot, path);
    const child = relative(resolvedRoot, absolute);
    if (child === '' || child.startsWith('..')) {
      throw new Error(`Refusing to remove outside repository root: ${path}`);
    }
    await rm(absolute, { recursive: true, force: true });
    removedPaths.push(path);
  }

  const rewrittenPaths = await rewriteRepositorySurfaces(resolvedRoot, inventory);
  await regenerateLockfile();
  if (await pruneRemovedLockfileEntries(resolvedRoot)) rewrittenPaths.push('package-lock.json');
  await validateCoverageMatrix(resolvedRoot);
  const remainingReferences = await findLegacyReferences(resolvedRoot);
  if (remainingReferences.length > 0) {
    throw new Error(
      `Legacy references remain after removal:\n${remainingReferences.map((path) => `- ${path}`).join('\n')}`
    );
  }

  return {
    commit: head,
    removedPaths,
    rewrittenPaths,
    deferredReferences: inventory.deferredReferences
  };
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a path`);
  return value;
}

function printHelp() {
  console.log(`Usage: node scripts/v3/remove-legacy-apps.mjs \\
  --acceptance <release-acceptance.json> \\
  --canonical-candidate <canonical-candidate.json> \\
  [--rollback-rehearsal <rollback-rehearsal.json>]`);
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
  } else {
    const acceptancePath = readOption(args, '--acceptance');
    const canonicalCandidatePath = readOption(args, '--canonical-candidate');
    if (!acceptancePath || !canonicalCandidatePath) {
      printHelp();
      process.exitCode = 1;
    } else {
      readJsonWithBytes(resolve(projectRoot, acceptancePath))
        .then(({ value: acceptance }) =>
          removeLegacyApps(projectRoot, acceptance, {
            canonicalCandidatePath: resolve(projectRoot, canonicalCandidatePath),
            rollbackRehearsalPath: resolve(
              projectRoot,
              readOption(args, '--rollback-rehearsal') ?? '.artifacts/v3/rollback-rehearsal.json'
            )
          })
        )
        .then((result) => console.log(JSON.stringify(result, null, 2)))
        .catch((error) => {
          console.error(error instanceof Error ? error.message : String(error));
          process.exitCode = 1;
        });
    }
  }
}
