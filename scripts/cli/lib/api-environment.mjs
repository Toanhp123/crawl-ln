import { constants } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function ensureApiEnvironment({ root }) {
  const apiRoot = join(root, 'apps', 'api');
  try {
    await copyFile(
      join(apiRoot, '.env.example'),
      join(apiRoot, '.env'),
      constants.COPYFILE_EXCL
    );
    return 'created';
  } catch (error) {
    if (error?.code === 'EEXIST') return 'existing';
    throw error;
  }
}
