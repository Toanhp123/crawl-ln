import path from 'node:path';
import { checkWebNextArchitecture } from './lib/web-next-architecture.mjs';

const root = path.resolve(process.argv[2] ?? 'apps/web-next');
const violations = await checkWebNextArchitecture(root);

if (violations.length > 0) {
  console.error(
    'Web Next architecture violations found:\n' +
      violations.map((violation) => `- ${violation}`).join('\n')
  );
  process.exitCode = 1;
} else {
  console.log('Web Next architecture check passed.');
}
