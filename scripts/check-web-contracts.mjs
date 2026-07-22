import { checkWebContracts } from './lib/web-contracts.mjs';

const violations = await checkWebContracts('apps/web/src');
if (violations.length) {
  console.error('Web contract check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log('Web contract check passed.');
