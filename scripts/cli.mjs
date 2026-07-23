import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { commandLoaders } from './cli/commands/index.mjs';
import { exitCodeFor } from './cli/lib/errors.mjs';

function writeLine(writer, value) {
  writer(String(value));
}

function topLevelHelp(registry) {
  return [
    'Novel Tool commands:',
    ...[...registry.keys()].map((name) => `  ${name}`),
    '',
    'Run "node scripts/cli.mjs <command> --help" for command help.'
  ].join('\n');
}

function formatError(error) {
  if (process.env.NOVEL_TOOL_DEBUG === '1' && error instanceof Error && error.stack) {
    return error.stack;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function executeCli(
  argv,
  { signal, registry = commandLoaders, stdout = console.log, stderr = console.error } = {}
) {
  const [commandName, ...commandArguments] = argv;
  if (!commandName || commandName === '--help' || commandName === '-h') {
    writeLine(stdout, topLevelHelp(registry));
    return 0;
  }

  const loader = registry.get(commandName);
  if (!loader) {
    writeLine(stderr, `Unknown command "${commandName}"`);
    writeLine(stderr, topLevelHelp(registry));
    return 2;
  }

  try {
    const command = await loader();
    if (!command || typeof command.execute !== 'function') {
      throw new Error(`Command "${commandName}" did not export an executable command`);
    }
    const result = await command.execute(commandArguments, {
      signal,
      stdout,
      stderr
    });
    return Number.isInteger(result) ? result : 0;
  } catch (error) {
    const message = formatError(error);
    writeLine(
      stderr,
      message.startsWith(`${commandName}:`) ? message : `${commandName}: ${message}`
    );
    return exitCodeFor(error);
  }
}

async function runEntrypoint() {
  const controller = new AbortController();
  let interrupted = false;
  const interrupt = () => {
    if (interrupted) return;
    interrupted = true;
    controller.abort();
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    process.exitCode = await executeCli(process.argv.slice(2), {
      signal: controller.signal
    });
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

const isEntrypoint =
  typeof process.argv[1] === 'string' &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isEntrypoint) {
  await runEntrypoint();
}
