import path from 'node:path';
import { checkWebArchitecture } from './lib/web-architecture.mjs';

const root = path.resolve(process.argv[2] ?? 'apps/web');
const violations = await checkWebArchitecture(root);

if (violations.length > 0) {
  console.error(
    'Web architecture violations found:\n' +
      violations.map((violation) => `- ${violation}`).join('\n')
  );
  process.exitCode = 1;
} else {
  console.log('Web architecture check passed.');
}
