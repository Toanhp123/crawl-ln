export const commandLoaders = new Map([
  ['setup', () => import('./setup.mjs').then((module) => module.setupCommand)],
  ['dev', () => import('./dev.mjs').then((module) => module.devCommand)],
  ['build', () => import('./build.mjs').then((module) => module.buildCommand)],
  ['start', () => import('./start.mjs').then((module) => module.startCommand)],
  ['check', () => import('./check.mjs').then((module) => module.checkCommand)],
  ['test', () => import('./test.mjs').then((module) => module.testCommand)],
  ['format', () => import('./format.mjs').then((module) => module.formatCommand)],
  ['clean', () => import('./clean.mjs').then((module) => module.cleanCommand)]
]);
