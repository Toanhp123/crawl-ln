import { join } from 'node:path';
import { parseOptions } from '../lib/arguments.mjs';
import { CommandFailure } from '../lib/errors.mjs';
import { collectFormatFiles, checkFormatPaths } from '../lib/format-files.mjs';
import { projectRoot } from '../lib/repository.mjs';

const GROUPS = ['format', 'types', 'architecture', 'docs', 'commands', 'lockfile'];

function helpText() {
  return [
    'Usage: node scripts/cli.mjs check [--group <name>]',
    '',
    'Static groups:',
    ...GROUPS.map((group) => `  ${group}`),
    '',
    'Options:',
    '  --group <name>  Run exactly one static group',
    '  --help          Show this help'
  ].join('\n');
}

async function failForErrors(label, errors) {
  if (errors.length > 0) {
    throw new CommandFailure(`${label} failed:\n${errors.map((item) => `- ${item}`).join('\n')}`);
  }
}

export async function runStaticGroup(group, context = {}) {
  const stdout = context.stdout ?? console.log;
  stdout(`[check] ${group}`);
  if (group === 'format') {
    await checkFormatPaths(await collectFormatFiles(undefined, projectRoot));
    return;
  }
  if (group === 'types') {
    const { checkTypeScriptProject } = await import('../../typescript-project.mjs');
    for (const config of [
      'packages/shared/tsconfig.json',
      'packages/source-plugin-sdk/tsconfig.json',
      'packages/reader-engine/tsconfig.json',
      'apps/api/tsconfig.check.json',
      'apps/web/tsconfig.json'
    ]) {
      checkTypeScriptProject(join(projectRoot, config), { noEmit: true });
    }
    return;
  }
  if (group === 'architecture') {
    const [
      { checkApiArchitecture },
      { checkWebArchitecture },
      { checkWebContracts },
      { checkReaderEngineArchitecture }
    ] = await Promise.all([
      import('../../lib/api-architecture.mjs'),
      import('../../lib/web-architecture.mjs'),
      import('../../lib/web-contracts.mjs'),
      import('../../lib/reader-engine-architecture.mjs')
    ]);
    await failForErrors(
      'API architecture',
      await checkApiArchitecture(join(projectRoot, 'apps/api/src'))
    );
    await failForErrors(
      'Web architecture',
      await checkWebArchitecture(join(projectRoot, 'apps/web'))
    );
    await failForErrors(
      'Web contracts',
      await checkWebContracts(join(projectRoot, 'apps/web/src'))
    );
    await failForErrors(
      'Reader engine architecture',
      await checkReaderEngineArchitecture(projectRoot)
    );
    return;
  }
  if (group === 'docs') {
    const { checkDocumentation } = await import('../../lib/documentation.mjs');
    const result = await checkDocumentation(projectRoot);
    await failForErrors('Documentation', result.errors);
    return;
  }
  if (group === 'commands') {
    const { checkRepositoryBoundaries } = await import('../lib/repository-boundaries.mjs');
    await failForErrors(
      'Repository command boundaries',
      await checkRepositoryBoundaries(projectRoot)
    );
    return;
  }
  if (group === 'lockfile') {
    const { readLockfile, validateLockfileObject } = await import('../lib/lockfile.mjs');
    validateLockfileObject(await readLockfile());
    return;
  }
  throw new CommandFailure(`Unknown static group: ${group}`);
}

export const checkCommand = {
  name: 'check',
  summary: 'Run static repository checks',
  async execute(argv, context = {}) {
    const { help, values } = parseOptions('check', argv, {
      group: { type: 'string', choices: GROUPS }
    });
    if (help) {
      (context.stdout ?? console.log)(helpText());
      return;
    }
    for (const group of values.group ? [values.group] : GROUPS) {
      await runStaticGroup(group, context);
    }
  }
};
