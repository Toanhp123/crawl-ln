import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  directoryMoves,
  isTextWorkspacePath,
  mapWorkspacePath,
  rewriteWorkspaceContent
} from './workspace-cutover-map.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_JOURNAL = '.artifacts/v3/workspace-rename-journal.json';
const SHA256 = /^[a-f0-9]{64}$/;
const smokeFields = ['apiHealth', 'httpContracts', 'webRoutes', 'reader', 'sourceReaderAdmin'];

function portable(path) {
  return path.replaceAll('\\', '/');
}

function hash(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

function assertCandidateManifest(manifest, commit) {
  if (!manifest || typeof manifest !== 'object' || manifest.formatVersion !== 1) {
    throw new Error('Invalid V3 candidate manifest');
  }
  if (manifest.commit !== commit) throw new Error('Candidate manifest commit does not match HEAD');
  if (!SHA256.test(manifest.migrationReportSha256 ?? '')) {
    throw new Error('Candidate manifest migration report hash is invalid');
  }
  if (
    manifest.verification?.command !== 'npm run verify:v3' ||
    manifest.verification?.passed !== true ||
    !Number.isFinite(Date.parse(manifest.verification?.completedAt))
  ) {
    throw new Error('Candidate manifest verification evidence is invalid');
  }
  for (const field of smokeFields) {
    if (manifest.smoke?.[field] !== true) {
      throw new Error(`Candidate manifest smoke evidence is invalid: ${field}`);
    }
  }
}

async function writeJsonAtomic(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function writeContentAtomic(path, content) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, content);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function git(root, args) {
  const { stdout } = await execFileAsync('git', args, { cwd: root, encoding: 'utf8' });
  return stdout.trim();
}

async function currentCommit(root) {
  return git(root, ['rev-parse', 'HEAD']);
}

async function trackedPaths(root) {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'buffer'
  });
  return stdout
    .toString('utf8')
    .split('\0')
    .map((path) => path.trim())
    .filter(Boolean)
    .map(portable);
}

const ignoredWorkspaceRootEntries = new Set(['dist', 'node_modules', 'storage']);

async function collectDirectoryFiles(root, relativeDirectory, output, moveRoot) {
  const directory = join(root, relativeDirectory);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (relativeDirectory === moveRoot && ignoredWorkspaceRootEntries.has(entry.name)) continue;
    const relativePath = portable(join(relativeDirectory, entry.name));
    if (entry.isDirectory()) {
      await collectDirectoryFiles(root, relativePath, output, moveRoot);
    } else if (entry.isFile()) {
      output.add(relativePath);
    }
  }
}

async function workspacePaths(root, tracked) {
  const paths = new Set(tracked);
  for (const move of directoryMoves.filter((item) => item.kind === 'directory')) {
    const moveRoot = portable(move.from);
    await collectDirectoryFiles(root, moveRoot, paths, moveRoot);
  }
  return [...paths].sort();
}

function allowedDirtyPath(path, allowlist) {
  const value = portable(path);
  return allowlist.some((allowed) => {
    const normalized = portable(allowed).replace(/\/$/, '');
    return value === normalized || value.startsWith(`${normalized}/`);
  });
}

async function assertTrackedClean(root, allowlist) {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '-z'], {
    cwd: root,
    encoding: 'buffer'
  });
  const dirty = stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((entry) => ({ status: entry.slice(0, 2), path: entry.slice(3) }))
    .filter(({ status }) => status !== '??' && status !== '!!');
  const disallowed = dirty.filter(({ path }) => !allowedDirtyPath(path, allowlist));
  if (disallowed.length > 0) {
    throw new Error(
      `Workspace rename requires tracked files to be clean: ${disallowed
        .map(({ path }) => path)
        .join(', ')}`
    );
  }
}

async function assertSourceAndTargetPaths(root) {
  const sourceSet = new Set(directoryMoves.map((move) => portable(move.from)));
  const seenSources = new Set();
  const seenTargets = new Set();
  for (const move of directoryMoves) {
    const source = portable(move.from);
    const target = portable(move.to);
    if (seenSources.has(source) || seenTargets.has(target)) {
      throw new Error(`Workspace rename map contains a duplicate path: ${source}`);
    }
    seenSources.add(source);
    seenTargets.add(target);
    if (!(await exists(join(root, source)))) {
      throw new Error(`Workspace rename source is missing: ${source}`);
    }
    if ((await exists(join(root, target))) && !sourceSet.has(target)) {
      throw new Error(`Workspace rename target is occupied: ${target}`);
    }
  }
}

function defaultJournalPath(root, value) {
  return resolve(root, value ?? DEFAULT_JOURNAL);
}

function defaultBackupPath(journalPath) {
  return `${journalPath}.backup-${randomUUID()}`;
}

function defaultStagePath(journalPath) {
  return `${journalPath}.stage-${randomUUID()}`;
}

function sameBytes(left, right) {
  return Buffer.compare(left, right) === 0;
}

async function buildRewritePlans(root, paths) {
  const plans = [];
  const preservedTooling = new Set([
    'scripts/v3/rename-workspaces.mjs',
    'scripts/v3/workspace-cutover-map.mjs',
    'tests/regression/v3-workspace-rename.test.ts'
  ]);
  for (const sourcePath of paths) {
    if (
      sourcePath === 'package-lock.json' ||
      sourcePath === 'CHANGELOG.md' ||
      preservedTooling.has(sourcePath) ||
      sourcePath.startsWith('specs/')
    )
      continue;
    if (!isTextWorkspacePath(sourcePath)) continue;
    const sourceAbsolute = join(root, sourcePath);
    const before = await readFile(sourceAbsolute);
    const targetPath = mapWorkspacePath(sourcePath);
    const after = rewriteWorkspaceContent({ sourcePath, targetPath, content: before });
    if (sameBytes(before, after)) continue;
    plans.push({ sourcePath, targetPath, before, after });
  }
  return plans;
}

function journalFor({ root, commit, moves, rewrites, journalPath, backupRoot, stageRoot, now }) {
  const timestamp = now().toISOString();
  return {
    formatVersion: 1,
    state: 'prepared',
    root,
    commit,
    moves: moves.map(({ from, to, kind }) => ({ from, to, kind })),
    rewrites: rewrites.map((rewrite) => ({
      path: rewrite.targetPath,
      backupPath: portable(relative(root, join(backupRoot, rewrite.targetPath))),
      beforeSha256: hash(rewrite.before),
      afterSha256: hash(rewrite.after)
    })),
    backupRoot: portable(relative(root, backupRoot)),
    stageRoot: portable(relative(root, stageRoot)),
    createdAt: timestamp,
    updatedAt: timestamp,
    journalPath: portable(relative(root, journalPath))
  };
}

async function writeBackups(root, backupRoot, plans) {
  for (const plan of plans) {
    const path = join(backupRoot, plan.targetPath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, plan.before);
  }
}

async function reverseMoves(root, moves, stageRoot, renamePath) {
  await mkdir(stageRoot, { recursive: true });
  const staged = [];
  const placed = [];
  try {
    for (let index = 0; index < moves.length; index += 1) {
      const move = moves[index];
      const target = join(root, move.to);
      if (!(await exists(target))) continue;
      const temporary = join(stageRoot, String(index));
      await renamePath(target, temporary);
      staged.push({ move, temporary });
    }
    for (const entry of [...staged].reverse()) {
      await renamePath(entry.temporary, join(root, entry.move.from));
      placed.push(entry);
    }
  } catch (error) {
    const recoveryErrors = [];
    try {
      for (const { move, temporary } of [...placed].reverse()) {
        if (await exists(join(root, move.from))) {
          await renamePath(join(root, move.from), temporary);
        }
      }
      for (const { move, temporary } of [...staged].reverse()) {
        if (await exists(temporary)) await renamePath(temporary, join(root, move.to));
      }
    } catch (recoveryError) {
      recoveryErrors.push(recoveryError);
    }
    if (recoveryErrors.length > 0) {
      throw new AggregateError(
        [error, ...recoveryErrors],
        'Workspace rollback move recovery failed'
      );
    }
    throw error;
  }
}

async function recoverInProcess({ root, stageRoot, staged, placed, plans, renamePath }) {
  const recoveryErrors = [];
  for (const plan of plans) {
    const target = join(root, plan.targetPath);
    if (!(await exists(target))) continue;
    try {
      await writeContentAtomic(target, plan.before);
    } catch (error) {
      recoveryErrors.push(error);
    }
  }
  try {
    for (const { move, temporary } of [...placed].reverse()) {
      if (await exists(join(root, move.to))) {
        await renamePath(join(root, move.to), temporary);
      }
    }
    for (const { move, temporary } of [...staged].reverse()) {
      if (await exists(temporary)) {
        await renamePath(temporary, join(root, move.from));
      }
    }
  } catch (error) {
    recoveryErrors.push(error);
  }
  await rm(stageRoot, { recursive: true, force: true });
  if (recoveryErrors.length > 0) {
    throw new AggregateError(recoveryErrors, 'Workspace rename recovery failed');
  }
}

function validateJournal(journal) {
  if (!journal || typeof journal !== 'object' || journal.formatVersion !== 1) {
    throw new Error('Invalid workspace rename journal');
  }
  if (!['prepared', 'completed', 'rolled-back'].includes(journal.state)) {
    throw new Error(`Invalid workspace rename journal state: ${journal.state}`);
  }
  if (
    typeof journal.root !== 'string' ||
    !Array.isArray(journal.moves) ||
    !Array.isArray(journal.rewrites)
  ) {
    throw new Error('Workspace rename journal is incomplete');
  }
  return journal;
}

async function loadJournal(root, journal) {
  if (typeof journal === 'string')
    return validateJournal(JSON.parse(await readFile(resolve(root, journal), 'utf8')));
  return validateJournal(journal);
}

export async function renameWorkspaces(
  root,
  manifest,
  {
    dryRun = false,
    journalPath: requestedJournalPath,
    allowDirty = [],
    renamePath = rename,
    writeContent = writeContentAtomic,
    now = () => new Date()
  } = {}
) {
  const workspaceRoot = resolve(root);
  const journalPath = defaultJournalPath(workspaceRoot, requestedJournalPath);
  const commit = await currentCommit(workspaceRoot);
  assertCandidateManifest(manifest, commit);
  await assertTrackedClean(workspaceRoot, allowDirty);
  await assertSourceAndTargetPaths(workspaceRoot);
  if (await exists(journalPath))
    throw new Error(`Workspace rename journal already exists: ${journalPath}`);

  const tracked = await trackedPaths(workspaceRoot);
  const paths = await workspacePaths(workspaceRoot, tracked);
  const rewritePlans = await buildRewritePlans(workspaceRoot, paths);
  const moves = directoryMoves.map((move) => ({ ...move }));
  if (dryRun) {
    return {
      formatVersion: 1,
      state: 'dry-run',
      moves,
      rewrites: rewritePlans.map((plan) => plan.targetPath),
      commit
    };
  }

  const backupRoot = defaultBackupPath(journalPath);
  const stageRoot = defaultStagePath(journalPath);
  await writeBackups(workspaceRoot, backupRoot, rewritePlans);
  let journal = journalFor({
    root: workspaceRoot,
    commit,
    moves,
    rewrites: rewritePlans,
    journalPath,
    backupRoot,
    stageRoot,
    now
  });
  await writeJsonAtomic(journalPath, journal);
  await mkdir(stageRoot, { recursive: true });
  const staged = [];
  const placed = [];
  try {
    for (let index = 0; index < moves.length; index += 1) {
      const move = moves[index];
      const source = join(workspaceRoot, move.from);
      const temporary = join(stageRoot, String(index));
      await renamePath(source, temporary);
      staged.push({ move, temporary });
    }
    for (const { move, temporary } of staged) {
      await renamePath(temporary, join(workspaceRoot, move.to));
      placed.push({ move, temporary });
    }
    for (const plan of rewritePlans) {
      await writeContent(join(workspaceRoot, plan.targetPath), plan.after);
    }
    journal = { ...journal, state: 'completed', updatedAt: now().toISOString() };
    await writeJsonAtomic(journalPath, journal);
    await rm(stageRoot, { recursive: true, force: true });
    const completedJournal = { ...journal, path: journalPath };
    return {
      ...completedJournal,
      journal: completedJournal,
      moves,
      rewrites: rewritePlans.map((plan) => plan.targetPath)
    };
  } catch (error) {
    try {
      await recoverInProcess({
        root: workspaceRoot,
        stageRoot,
        staged,
        placed,
        plans: rewritePlans,
        renamePath
      });
      await rm(backupRoot, { recursive: true, force: true });
      journal = { ...journal, state: 'rolled-back', updatedAt: now().toISOString() };
      await writeJsonAtomic(journalPath, journal);
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        'Workspace rename failed and recovery failed'
      );
    }
    throw error;
  }
}

export async function rollbackWorkspaceRename(
  root,
  input,
  { renamePath = rename, now = () => new Date() } = {}
) {
  const workspaceRoot = resolve(root);
  const journal = await loadJournal(workspaceRoot, input);
  if (journal.state !== 'completed') {
    throw new Error(`Workspace rollback requires a completed journal, found ${journal.state}`);
  }
  if (resolve(journal.root) !== workspaceRoot)
    throw new Error('Workspace journal root does not match');
  const stageRoot = join(workspaceRoot, `${journal.stageRoot}-rollback-${randomUUID()}`);
  const currentContents = new Map();
  for (const rewrite of journal.rewrites) {
    const target = join(workspaceRoot, rewrite.path);
    const backup = join(workspaceRoot, rewrite.backupPath);
    if (!(await exists(target)) || !(await exists(backup))) {
      throw new Error(`Workspace rollback backup is missing: ${rewrite.path}`);
    }
    const current = await readFile(target);
    if (hash(current) !== rewrite.afterSha256) {
      throw new Error(`Workspace rollback detected an unexpected edit: ${rewrite.path}`);
    }
    currentContents.set(rewrite.path, current);
  }
  for (const rewrite of journal.rewrites) {
    await writeContentAtomic(
      join(workspaceRoot, rewrite.path),
      await readFile(join(workspaceRoot, rewrite.backupPath))
    );
  }
  try {
    await reverseMoves(workspaceRoot, journal.moves, stageRoot, renamePath);
  } catch (error) {
    for (const rewrite of journal.rewrites) {
      const target = join(workspaceRoot, rewrite.path);
      if (await exists(target)) {
        await writeContentAtomic(target, currentContents.get(rewrite.path));
      }
    }
    await rm(stageRoot, { recursive: true, force: true });
    throw error;
  }
  await rm(stageRoot, { recursive: true, force: true });
  const updated = { ...journal, state: 'rolled-back', updatedAt: now().toISOString() };
  const journalPath = join(workspaceRoot, journal.journalPath);
  await writeJsonAtomic(journalPath, updated);
  return { ...updated, path: journalPath };
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function repeatedOption(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    values.push(value);
  }
  return values;
}

function printHelp() {
  console.log(`Usage:
  node --import tsx scripts/v3/rename-workspaces.mjs --manifest <candidate.json> [options]
  node --import tsx scripts/v3/rename-workspaces.mjs --rollback-journal <journal.json>

Options:
  --root <path>          Repository root (default: current directory)
  --manifest <path>      Current-HEAD V3 candidate manifest
  --dry-run              List every move and rewrite without changing files
  --journal <path>       Journal path (default: .artifacts/v3/workspace-rename-journal.json)
  --allow-dirty <path>   Allow an acknowledged tracked path; may be repeated
  --rollback-journal <path>  Reverse a completed rename journal`);
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
  } else {
    const root = resolve(option(args, '--root', process.cwd()));
    const rollbackJournal = args.includes('--rollback-journal')
      ? option(args, '--rollback-journal')
      : undefined;
    const run = async () => {
      if (rollbackJournal) return rollbackWorkspaceRename(root, rollbackJournal);
      const manifestPath = option(args, '--manifest');
      const manifest = JSON.parse(await readFile(resolve(root, manifestPath), 'utf8'));
      return renameWorkspaces(root, manifest, {
        dryRun: args.includes('--dry-run'),
        journalPath: option(args, '--journal'),
        allowDirty: repeatedOption(args, '--allow-dirty')
      });
    };
    run()
      .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
      .catch((error) => {
        console.error(error instanceof Error ? (error.stack ?? error.message) : error);
        process.exitCode = 1;
      });
  }
}
