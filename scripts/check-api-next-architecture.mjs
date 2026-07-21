import path from 'node:path';
import { checkApiNextArchitecture } from './lib/api-next-architecture.mjs';

const root = path.resolve(process.argv[2] ?? 'apps/api-next/src');
const violations = await checkApiNextArchitecture(root);

if (violations.length > 0) {
  console.error(
    'API Next architecture violations found:\n' +
      violations.map((violation) => `- ${violation}`).join('\n')
  );
  process.exitCode = 1;
} else {
  console.log('API Next architecture check passed.');
}
