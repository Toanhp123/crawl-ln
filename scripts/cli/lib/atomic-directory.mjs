import { randomUUID } from 'node:crypto';
import { access, rename, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { CommandFailure } from './errors.mjs';

async function exists(path) {
  return access(path).then(
    () => true,
    () => false
  );
}

function assertSibling(parent, path, label) {
  if (dirname(resolve(path)) !== parent || resolve(path) === parent) {
    throw new CommandFailure(`${label} must be a safe sibling under ${parent}`);
  }
}

export async function promoteDirectory({ target, stage, beforePromote } = {}) {
  const absoluteTarget = resolve(target);
  const absoluteStage = resolve(stage);
  const parent = dirname(absoluteTarget);
  if (dirname(absoluteStage) !== parent) {
    throw new CommandFailure('Atomic directory stage and target must share a parent');
  }
  assertSibling(parent, absoluteTarget, 'Atomic directory target');
  assertSibling(parent, absoluteStage, 'Atomic directory stage');
  if (!(await exists(absoluteStage))) {
    throw new CommandFailure(`Atomic directory stage is missing: ${absoluteStage}`);
  }

  const backup = resolve(parent, `.${basename(absoluteTarget)}-backup-${randomUUID()}`);
  assertSibling(parent, backup, 'Atomic directory backup');
  let movedTarget = false;
  let promoted = false;
  try {
    if (await exists(absoluteTarget)) {
      await rename(absoluteTarget, backup);
      movedTarget = true;
    }
    await beforePromote?.();
    await rename(absoluteStage, absoluteTarget);
    promoted = true;
    if (movedTarget) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (promoted && (await exists(absoluteTarget))) {
      await rm(absoluteTarget, { recursive: true, force: true });
    }
    if (movedTarget && (await exists(backup))) {
      await rename(backup, absoluteTarget);
    }
    if (await exists(absoluteStage)) {
      await rm(absoluteStage, { recursive: true, force: true });
    }
    throw error;
  }
}
