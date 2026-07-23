import { parseOptions } from '../lib/arguments.mjs';
import { runDevelopment } from '../lib/development.mjs';

function helpText() {
  return [
    'Usage: node scripts/cli.mjs dev [--target <api|web>]',
    '',
    'Run the API and Vite together with frontend HMR.',
    '',
    'Options:',
    '  --target <api|web>  Run only one development target',
    '  --help              Show this help'
  ].join('\n');
}

export const devCommand = {
  name: 'dev',
  summary: 'Run supervised API and Vite development',
  async execute(argv, context = {}) {
    const { help, values } = parseOptions('dev', argv, {
      target: { type: 'string', choices: ['api', 'web'] }
    });
    if (help) {
      (context.stdout ?? console.log)(helpText());
      return;
    }
    return runDevelopment({
      target: values.target,
      signal: context.signal,
      stdout: context.stdout
    });
  }
};
