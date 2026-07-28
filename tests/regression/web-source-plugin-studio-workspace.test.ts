import assert from 'node:assert/strict';
import test from 'node:test';
import type { SourcePluginProject } from '../../apps/web/src/entities/source-plugin-project/index.ts';
import {
  createSourcePluginWorkspaceController,
  hasUnsavedSourcePluginWorkspaceChanges
} from '../../apps/web/src/features/edit-source-plugin-project/index.ts';
import {
  runSourcePluginStudioAction,
  runSourcePluginStudioBuild,
  runSourcePluginStudioClose
} from '../../apps/web/src/widgets/source-plugin-studio/model/workbench-operations.ts';

function project(overrides: Partial<SourcePluginProject> = {}): SourcePluginProject {
  return {
    id: 'project-1',
    name: 'Demo Reader',
    pluginId: 'demo-reader',
    version: '1.0.0',
    hosts: ['example.com'],
    capabilities: ['metadata'],
    selectors: { title: 'title' },
    files: { 'src/index.ts': 'first' },
    revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

test('workspace serializes saves and sends the latest files with the latest revision', async () => {
  let releaseFirstSave!: () => void;
  const firstSaveBlocked = new Promise<void>((resolve) => {
    releaseFirstSave = resolve;
  });
  const calls: Array<{ expectedRevision: number; files: Record<string, string> }> = [];
  let activeSaves = 0;
  let maxActiveSaves = 0;

  const controller = createSourcePluginWorkspaceController({
    project: project(),
    save: async (input) => {
      calls.push({
        expectedRevision: input.expectedRevision,
        files: { ...input.files }
      });
      activeSaves += 1;
      maxActiveSaves = Math.max(maxActiveSaves, activeSaves);
      if (calls.length === 1) await firstSaveBlocked;
      activeSaves -= 1;
      return project({
        files: { ...input.files },
        revision: input.expectedRevision + 1,
        updatedAt: `2026-01-01T00:00:0${input.expectedRevision}.000Z`
      });
    }
  });

  controller.updateFile('src/index.ts', 'second');
  const firstFlush = controller.flush();
  while (calls.length === 0) await new Promise((resolve) => setImmediate(resolve));

  controller.updateFile('src/index.ts', 'third');
  const secondFlush = controller.flush();
  await Promise.resolve();

  assert.equal(calls.length, 1);
  releaseFirstSave();
  await Promise.all([firstFlush, secondFlush]);

  assert.equal(maxActiveSaves, 1);
  assert.deepEqual(calls, [
    { expectedRevision: 1, files: { 'src/index.ts': 'second' } },
    { expectedRevision: 2, files: { 'src/index.ts': 'third' } }
  ]);
  assert.deepEqual(controller.getSnapshot(), {
    project: project({
      files: { 'src/index.ts': 'third' },
      revision: 3,
      updatedAt: '2026-01-01T00:00:02.000Z'
    }),
    selectedFile: 'src/index.ts',
    status: 'saved',
    error: undefined
  });
});

test('workspace preserves local files and reports conflict when the server revision changed', async () => {
  const conflict = Object.assign(new Error('stale revision'), { code: 'CONFLICT' });
  const statuses: string[] = [];
  const controller = createSourcePluginWorkspaceController({
    project: project(),
    save: async () => {
      throw conflict;
    },
    isConflict: (error) => error === conflict
  });
  const unsubscribe = controller.subscribe(() => {
    statuses.push(controller.getSnapshot().status);
  });

  controller.updateFile('src/index.ts', 'local draft');
  await assert.rejects(() => controller.flush(), /stale revision/);
  unsubscribe();

  assert.deepEqual(statuses, ['dirty', 'saving', 'conflict']);
  assert.equal(controller.getSnapshot().project.files['src/index.ts'], 'local draft');
  assert.equal(controller.getSnapshot().error, conflict);
});

test('workspace schedules autosave and flush cancels the pending timer', async () => {
  let scheduled: (() => void) | undefined;
  let scheduledDelay = 0;
  const cancelled: number[] = [];
  let saveCount = 0;
  const controller = createSourcePluginWorkspaceController({
    project: project(),
    debounceMs: 650,
    scheduler: {
      schedule(callback, delay) {
        scheduled = callback;
        scheduledDelay = delay;
        return 7;
      },
      cancel(handle) {
        cancelled.push(handle as number);
      }
    },
    save: async (input) => {
      saveCount += 1;
      return project({
        files: { ...input.files },
        revision: input.expectedRevision + 1
      });
    }
  });

  controller.updateFile('src/index.ts', 'autosaved');
  assert.equal(scheduledDelay, 650);
  assert.equal(typeof scheduled, 'function');

  await controller.flush();
  scheduled?.();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(cancelled, [7]);
  assert.equal(saveCount, 1);
  assert.equal(controller.getSnapshot().status, 'saved');
});

test('studio actions flush the draft before using the current project revision', async () => {
  const events: string[] = [];
  const result = await runSourcePluginStudioAction({
    flush: async () => {
      events.push('flush');
      return project({ revision: 4 });
    },
    action: async (currentProject) => {
      events.push(`action:${currentProject.revision}`);
      return currentProject.pluginId;
    }
  });

  assert.deepEqual(events, ['flush', 'action:4']);
  assert.equal(result, 'demo-reader');
});

test('workspace can replace a conflicted draft with the latest server project', async () => {
  const controller = createSourcePluginWorkspaceController({
    project: project(),
    save: async () => {
      throw new Error('conflict');
    },
    isConflict: () => true
  });
  controller.updateFile('src/index.ts', 'local draft');
  await assert.rejects(() => controller.flush());

  controller.replaceProject(
    project({
      revision: 2,
      files: { 'src/index.ts': 'server draft', 'manifest.json': '{}' }
    })
  );

  assert.deepEqual(controller.getSnapshot(), {
    project: project({
      revision: 2,
      files: { 'src/index.ts': 'server draft', 'manifest.json': '{}' }
    }),
    selectedFile: 'src/index.ts',
    status: 'clean',
    error: undefined
  });
});

test('workspace changes the selected project file without marking the draft dirty', () => {
  const controller = createSourcePluginWorkspaceController({
    project: project({ files: { 'src/index.ts': 'code', 'manifest.json': '{}' } }),
    save: async () => {
      throw new Error('save should not run');
    }
  });

  controller.selectFile('manifest.json');

  assert.equal(controller.getSnapshot().selectedFile, 'manifest.json');
  assert.equal(controller.getSnapshot().status, 'clean');
});

test('workspace blocks further autosaves after a revision conflict', async () => {
  const conflict = new Error('conflict');
  let scheduledSaves = 0;
  const controller = createSourcePluginWorkspaceController({
    project: project(),
    scheduler: {
      schedule() {
        scheduledSaves += 1;
        return scheduledSaves;
      },
      cancel() {}
    },
    save: async () => {
      throw conflict;
    },
    isConflict: (error) => error === conflict
  });

  controller.updateFile('src/index.ts', 'first local draft');
  await assert.rejects(() => controller.flush());
  controller.updateFile('src/index.ts', 'second local draft');

  assert.equal(scheduledSaves, 1);
  assert.equal(controller.getSnapshot().status, 'conflict');
  assert.equal(controller.getSnapshot().project.files['src/index.ts'], 'second local draft');
});

test('workspace does not run a queued save after the preceding save reports a conflict', async () => {
  const conflict = new Error('conflict');
  let rejectSave!: (error: unknown) => void;
  let saveCount = 0;
  const controller = createSourcePluginWorkspaceController({
    project: project(),
    save: () => {
      saveCount += 1;
      if (saveCount === 1) {
        return new Promise<SourcePluginProject>((_resolve, reject) => {
          rejectSave = reject;
        });
      }
      return Promise.resolve(project({ revision: 2 }));
    },
    isConflict: (error) => error === conflict
  });

  controller.updateFile('src/index.ts', 'local draft');
  const firstFlush = controller.flush();
  const secondFlush = controller.flush();
  while (saveCount === 0) await new Promise((resolve) => setImmediate(resolve));

  const settled = Promise.allSettled([firstFlush, secondFlush]);
  rejectSave(conflict);
  await settled;

  assert.equal(saveCount, 1);
  assert.equal(controller.getSnapshot().status, 'conflict');
});

test('workspace keeps edits made while a build is pending and marks that build stale', async () => {
  let resolveBuild!: (value: { checksum: string; revision: number; stale: boolean }) => void;
  const build = new Promise<{ checksum: string; revision: number; stale: boolean }>((resolve) => {
    resolveBuild = resolve;
  });
  const controller = createSourcePluginWorkspaceController({
    project: project(),
    save: async (input) =>
      project({
        files: { ...input.files },
        revision: input.expectedRevision + 1
      })
  });
  const applyPendingBuild = build.then((result) => controller.applyBuild(result));

  controller.updateFile('src/index.ts', 'edited while building');
  resolveBuild({ checksum: 'build-checksum', revision: 1, stale: false });
  await applyPendingBuild;

  assert.equal(controller.getSnapshot().project.files['src/index.ts'], 'edited while building');
  assert.deepEqual(controller.getSnapshot().project.build, {
    checksum: 'build-checksum',
    revision: 1,
    stale: true
  });
  assert.equal(controller.getSnapshot().status, 'dirty');

  await controller.flush();
  assert.equal(controller.getSnapshot().project.files['src/index.ts'], 'edited while building');
  assert.equal(controller.getSnapshot().project.revision, 2);
});

test('studio build defers autosave until the build finishes, then persists the edit', async () => {
  let scheduledSave: (() => void) | undefined;
  let resolveBuild!: (value: { checksum: string; revision: number; stale: boolean }) => void;
  const build = new Promise<{ checksum: string; revision: number; stale: boolean }>((resolve) => {
    resolveBuild = resolve;
  });
  let buildStarted = false;
  let saveCount = 0;
  const controller = createSourcePluginWorkspaceController({
    project: project(),
    scheduler: {
      schedule(callback) {
        scheduledSave = callback;
        return callback;
      },
      cancel() {
        scheduledSave = undefined;
      }
    },
    save: async (input) => {
      saveCount += 1;
      return project({
        files: { ...input.files },
        revision: input.expectedRevision + 1
      });
    }
  });

  const pendingBuild = runSourcePluginStudioBuild({
    pauseAutosave: controller.pauseAutosave,
    flush: controller.flush,
    build: async (currentProject) => {
      buildStarted = true;
      assert.equal(currentProject.revision, 1);
      return build;
    },
    applyBuild: controller.applyBuild
  });
  while (!buildStarted) await new Promise((resolve) => setImmediate(resolve));

  controller.updateFile('src/index.ts', 'edited while building');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saveCount, 0);
  assert.equal(scheduledSave, undefined);

  resolveBuild({ checksum: 'build-checksum', revision: 1, stale: false });
  await pendingBuild;

  assert.equal(controller.getSnapshot().project.files['src/index.ts'], 'edited while building');
  assert.equal(controller.getSnapshot().project.build?.stale, true);
  assert.equal(typeof scheduledSave, 'function');
  assert.equal(saveCount, 0);

  scheduledSave?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(saveCount, 1);
  assert.equal(controller.getSnapshot().project.files['src/index.ts'], 'edited while building');
  assert.equal(controller.getSnapshot().project.revision, 2);
});

test('workspace treats empty project files as existing when choosing the active file', () => {
  const controller = createSourcePluginWorkspaceController({
    project: project({ files: { 'manifest.json': '{}', 'src/index.ts': '' } }),
    save: async () => {
      throw new Error('save should not run');
    }
  });
  assert.equal(controller.getSnapshot().selectedFile, 'src/index.ts');

  controller.selectFile('manifest.json');
  controller.replaceProject(
    project({ revision: 2, files: { 'manifest.json': '', 'src/index.ts': '' } })
  );

  assert.equal(controller.getSnapshot().selectedFile, 'manifest.json');
});

test('workspace reports unload risk while edits are not safely persisted', () => {
  assert.equal(hasUnsavedSourcePluginWorkspaceChanges('clean'), false);
  assert.equal(hasUnsavedSourcePluginWorkspaceChanges('saved'), false);
  assert.equal(hasUnsavedSourcePluginWorkspaceChanges('dirty'), true);
  assert.equal(hasUnsavedSourcePluginWorkspaceChanges('saving'), true);
  assert.equal(hasUnsavedSourcePluginWorkspaceChanges('conflict'), true);
  assert.equal(hasUnsavedSourcePluginWorkspaceChanges('error'), true);
});

test('studio close flushes the draft before leaving the workbench', async () => {
  const events: string[] = [];

  await runSourcePluginStudioClose({
    flush: async () => {
      events.push('flush');
      return project({ revision: 2 });
    },
    close: () => events.push('close')
  });

  assert.deepEqual(events, ['flush', 'close']);
});

test('studio close keeps the workbench open when flushing fails', async () => {
  let closed = false;

  await assert.rejects(() =>
    runSourcePluginStudioClose({
      flush: async () => {
        throw new Error('save failed');
      },
      close: () => {
        closed = true;
      }
    })
  );

  assert.equal(closed, false);
});
