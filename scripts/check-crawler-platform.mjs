import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'apps/api/src/modules/crawler');
const crawlerModulePath = join(
  process.cwd(),
  'apps/api/src/shared/container/modules/crawler.module.ts'
);
const violations = [];
const sources = [];

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
  sources.push(source);
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

const crawlerSource = sources.join('\n');
const crawlerModule = readFileSync(crawlerModulePath, 'utf8');
const forbiddenCrawlerSourceSymbols = [
  ['Source', 'Adapter'].join(''),
  ['Source', 'Detector'].join(''),
  ['Source', 'Profile'].join(''),
  ['Selector', 'HtmlAdapter'].join(''),
  ['Plugin', 'Source', 'Adapter'].join(''),
  ['Crawler', 'EngineService'].join('')
];
for (const symbol of forbiddenCrawlerSourceSymbols) {
  if (crawlerSource.includes(symbol)) {
    violations.push(`crawler retains removed source symbol ${symbol}`);
  }
}
if (!crawlerModule.includes('sourceReader.api')) {
  violations.push('crawler is not composed with SourceReaderApi');
}

if (violations.length > 0) {
  console.error('Crawler platform check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Crawler platform check passed.');
