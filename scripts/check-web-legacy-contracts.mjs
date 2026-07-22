import { checkWebContracts } from './lib/web-contracts.mjs';

const violations = await checkWebContracts('apps/web-legacy/src');
if (violations.length) {
  console.error('Frontend contract check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log('Frontend contract check passed.');
