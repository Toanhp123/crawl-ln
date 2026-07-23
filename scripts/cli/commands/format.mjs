import { parseOptions } from '../lib/arguments.mjs';
import { collectFormatFiles, formatPaths } from '../lib/format-files.mjs';

const TARGETS = ['api', 'web', 'packages', 'scripts', 'tests', 'docs'];

function helpText() {
  return [
    'Usage: node scripts/cli.mjs format [--target <name>]',
    '',
    'Formatting targets:',
    ...TARGETS.map((target) => `  ${target}`),
    '',
    'Options:',
    '  --target <name>  Format exactly one target',
    '  --help           Show this help'
  ].join('\n');
}

export const formatCommand = {
  name: 'format',
  summary: 'Apply Prettier to owned source files',
  async execute(argv, context = {}) {
    const { help, values } = parseOptions('format', argv, {
      target: { type: 'string', choices: TARGETS }
    });
    if (help) {
      (context.stdout ?? console.log)(helpText());
      return;
    }
    const files = await collectFormatFiles(values.target);
    await formatPaths(files);
    (context.stdout ?? console.log)(`[format] ${values.target ?? 'all'}: ${files.length} files`);
  }
};
