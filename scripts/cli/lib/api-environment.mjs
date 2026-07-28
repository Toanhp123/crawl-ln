import { randomBytes } from 'node:crypto';
import { access, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';

function createSecret(randomBytesFn, encoding) {
  return randomBytesFn(32).toString(encoding);
}

export function materializeApiEnvironment(template, randomBytesFn = randomBytes) {
  const cursorKey = createSecret(randomBytesFn, 'base64url');
  const masterKey = createSecret(randomBytesFn, 'base64');
  let environment = template
    .replace(
      /^SOURCE_READER_CURSOR_KEY=replace-with-a-private-key\s*$/m,
      `SOURCE_READER_CURSOR_KEY=${cursorKey}`
    )
    .replace(/^# SOURCE_READER_MASTER_KEY=\s*$/m, `SOURCE_READER_MASTER_KEY=${masterKey}`);

  if (!/^SOURCE_READER_CURSOR_KEY=/m.test(environment)) {
    environment += `${environment.endsWith('\n') ? '' : '\n'}SOURCE_READER_CURSOR_KEY=${cursorKey}\n`;
  }
  if (!/^SOURCE_READER_MASTER_KEY=/m.test(environment)) {
    environment += `${environment.endsWith('\n') ? '' : '\n'}SOURCE_READER_MASTER_KEY=${masterKey}\n`;
  }
  return environment;
}

export async function ensureApiEnvironment({ root, randomBytesFn = randomBytes }) {
  const apiRoot = join(root, 'apps', 'api');
  const environmentPath = join(apiRoot, '.env');
  try {
    await access(environmentPath);
    return 'existing';
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  try {
    const template = await readFile(join(apiRoot, '.env.example'), 'utf8');
    const environment = materializeApiEnvironment(template, randomBytesFn);
    const handle = await open(environmentPath, 'wx');
    try {
      await handle.writeFile(environment, 'utf8');
    } finally {
      await handle.close();
    }
    return 'created';
  } catch (error) {
    if (error?.code === 'EEXIST') return 'existing';
    throw error;
  }
}
