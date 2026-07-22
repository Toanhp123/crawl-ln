import path from 'node:path';
import { checkApiArchitecture } from './lib/api-architecture.mjs';

const root = path.resolve(process.argv[2] ?? 'apps/api/src');
const violations = await checkApiArchitecture(root);

if (violations.length > 0) {
  console.error(
    'API architecture violations found:\n' +
      violations.map((violation) => `- ${violation}`).join('\n')
  );
  process.exitCode = 1;
} else {
  console.log('API architecture check passed.');
}
