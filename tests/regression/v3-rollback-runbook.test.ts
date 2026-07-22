import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function fencedCommands(source: string): string {
  return [...source.matchAll(/```(?:powershell|sh)\n([\s\S]*?)```/g)]
    .map((match) => match[1])
    .join('\n');
}

test('cutover prepares a detached legacy rollback runtime before the live swap', async () => {
  const source = await readFile('docs/V3_CUTOVER.md', 'utf8');
  const prepareIndex = source.indexOf('## Prepare rollback runtime');
  const swapIndex = source.indexOf('## Swap');

  assert.ok(prepareIndex >= 0, 'rollback runtime preparation section is missing');
  assert.ok(swapIndex > prepareIndex, 'rollback runtime must be prepared before the live swap');
  assert.match(
    source,
    /Get-Content -Raw \.artifacts\/v3\/canonical-candidate\.json \| ConvertFrom-Json/
  );
  assert.match(source, /git worktree add --detach \$rollbackRuntime \$canonical\.commit/);
  assert.match(source, /ROLLBACK_COMMIT=.*canonical-candidate\.json/);
  assert.match(source, /git worktree add --detach "\$ROLLBACK_RUNTIME" "\$ROLLBACK_COMMIT"/);
  assert.equal((source.match(/npm ci --ignore-scripts/g) ?? []).length, 2);
  assert.equal((source.match(/npm run build:legacy/g) ?? []).length, 2);
  assert.match(source, /\.artifacts\/v3\/rollback-runtime/);
});

test('rollback starts only the prepared v22 runtime against absolute restored storage', async () => {
  const source = await readFile('docs/V3_ROLLBACK.md', 'utf8');
  const commands = fencedCommands(source);

  assert.match(source, /Do not[\s\S]{0,80}`npm run dev:api`/i);
  assert.doesNotMatch(commands, /npm run dev:api/);
  assert.match(
    source,
    /\$env:STORAGE_DIR = \(Resolve-Path ['"]\.artifacts\/v3\/live-storage['"]\)\.Path/
  );
  assert.match(source, /npm run start -w @novel-tool\/api-legacy/);
  assert.match(source, /npm run preview -w @novel-tool\/web-legacy/);
  assert.match(source, /LIVE_STORAGE=.*\.artifacts\/v3\/live-storage/);
  assert.match(source, /STORAGE_DIR="\$LIVE_STORAGE" npm run start -w @novel-tool\/api-legacy/);
  assert.match(source, /git worktree remove.*rollback-runtime/);
  assert.match(source, /after (?:the )?incident.*(?:closed|recovery window)/i);
});
