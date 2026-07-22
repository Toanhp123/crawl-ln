import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const storageDir = resolve(process.cwd(), 'storage');
const files = [
  'novel-tool.sqlite',
  'novel-tool.sqlite-shm',
  'novel-tool.sqlite-wal',
];

await Promise.all(
  files.map((file) => rm(resolve(storageDir, file), { force: true })),
);

console.log('SQLite database files removed.');
