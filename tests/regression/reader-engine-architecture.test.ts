import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkReaderEngineArchitecture } from '../../scripts/lib/reader-engine-architecture.mjs';

test('reader engine imports no framework, browser, app, or transport dependency', async () => {
  assert.deepEqual(await checkReaderEngineArchitecture(process.cwd()), []);
});

test('reader engine purity checker rejects forbidden imports and browser globals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reader-engine-architecture-'));
  try {
    const sourceRoot = join(root, 'packages', 'reader-engine', 'src');
    await mkdir(sourceRoot, { recursive: true });
    await writeFile(
      join(sourceRoot, 'bad.ts'),
      "import React from 'react';\nexport const value = window.location.href + localStorage.length;\n"
    );
    const errors = await checkReaderEngineArchitecture(root);
    assert.ok(errors.some((error) => error.includes("forbidden import 'react'")));
    assert.ok(errors.some((error) => error.includes("forbidden browser identifier 'window'")));
    assert.ok(
      errors.some((error) => error.includes("forbidden browser identifier 'localStorage'"))
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
