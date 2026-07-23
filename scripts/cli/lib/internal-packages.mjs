import { join } from 'node:path';
import { emitTypeScriptProject } from '../../typescript-project.mjs';
import { projectRoot } from './repository.mjs';

const projects = {
  shared: 'packages/shared/tsconfig.json',
  sdk: 'packages/source-plugin-sdk/tsconfig.json',
  'reader-engine': 'packages/reader-engine/tsconfig.json'
};

export function prepareInternalPackages(
  targets = ['shared', 'sdk', 'reader-engine'],
  root = projectRoot
) {
  const prepared = new Set();
  for (const target of targets) {
    const config = projects[target];
    if (!config) throw new Error(`Unknown internal package target: ${target}`);
    if (prepared.has(target)) continue;
    emitTypeScriptProject(join(root, config));
    prepared.add(target);
  }
}
