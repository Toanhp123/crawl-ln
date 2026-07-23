import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('check exposes the approved static groups and format exposes approved targets', async () => {
  const { checkCommand } = await import('../../scripts/cli/commands/check.mjs');
  const { formatCommand } = await import('../../scripts/cli/commands/format.mjs');
  const output: string[] = [];
  await checkCommand.execute(['--help'], { stdout: (line: string) => output.push(line) });
  await formatCommand.execute(['--help'], { stdout: (line: string) => output.push(line) });
  const help = output.join('\n');
  for (const group of ['format', 'types', 'architecture', 'docs', 'commands', 'lockfile']) {
    assert.match(help, new RegExp(group));
  }
  for (const target of ['api', 'web', 'packages', 'scripts', 'tests', 'docs']) {
    assert.match(help, new RegExp(target));
  }
});

test('format changes an unformatted fixture while format-check is read-only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-format-'));
  try {
    const file = join(root, 'scripts', 'fixture.mjs');
    await mkdir(join(root, 'scripts'), { recursive: true });
    await writeFile(file, 'export const value={a:1,b:2}\n');
    const { formatPaths, checkFormatPaths } =
      await import('../../scripts/cli/lib/format-files.mjs');
    const before = await readFile(file, 'utf8');
    await assert.rejects(() => checkFormatPaths([file]), /fixture\.mjs/);
    assert.equal(await readFile(file, 'utf8'), before);
    await formatPaths([file]);
    assert.notEqual(await readFile(file, 'utf8'), before);
    await checkFormatPaths([file]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
