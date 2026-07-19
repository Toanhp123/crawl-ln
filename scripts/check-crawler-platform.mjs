import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'apps/api/src/modules/crawler');
const violations = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    const stat = statSync(file);
    if (stat.isDirectory()) walk(file);
    else if (file.endsWith('.ts')) check(file);
  }
}

function check(file) {
  const source = readFileSync(file, 'utf8');
  if (source.includes('../http/http-client.js') || source.includes('httpClient } from')) {
    violations.push(`${file}: uses legacy singleton httpClient instead of HttpClientPort`);
  }
  if (file.includes('/domain/') && source.includes('/infrastructure/')) {
    violations.push(`${file}: domain imports infrastructure`);
  }
  if (file.includes('/application/') && source.includes('/infrastructure/')) {
    violations.push(`${file}: application imports infrastructure`);
  }
}

walk(root);

if (violations.length > 0) {
  console.error('Crawler platform check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Crawler platform check passed.');
