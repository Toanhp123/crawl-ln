import { readFile } from 'node:fs/promises';

const lockfile = new URL('../package-lock.json', import.meta.url);
const text = await readFile(lockfile, 'utf8');
const forbiddenHosts = [
  'packages.applied-caas-gateway1.internal.api.openai.org',
  '.internal.api.openai.org'
];

const matches = forbiddenHosts.filter((host) => text.includes(host));
if (matches.length > 0) {
  console.error(`package-lock.json contains non-portable registry hosts: ${matches.join(', ')}`);
  process.exit(1);
}

const lock = JSON.parse(text);
for (const [name, metadata] of Object.entries(lock.packages ?? {})) {
  const resolved = metadata?.resolved;
  if (typeof resolved !== 'string' || !resolved.startsWith('http')) continue;
  const host = new URL(resolved).hostname;
  if (host !== 'registry.npmjs.org') {
    console.error(`Unexpected package registry host for ${name || '<root>'}: ${host}`);
    process.exit(1);
  }
}

console.log('package-lock.json uses portable public npm registry URLs.');
