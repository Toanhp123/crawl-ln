import { CommandUsageError } from './errors.mjs';

function optionLabel(name) {
  return `--${name}`;
}

export function parseOptions(commandName, argv, optionSchema = {}) {
  const values = {};
  const seen = new Set();
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      throw new CommandUsageError(`${commandName}: Unexpected positional argument "${argument}"`);
    }
    if (argument.includes('=')) {
      throw new CommandUsageError(
        `${commandName}: Option "${argument.split('=')[0]}" does not accept = syntax`
      );
    }

    const name = argument.slice(2);
    if (!name) {
      throw new CommandUsageError(`${commandName}: Invalid empty option`);
    }
    if (name === 'help') {
      if (seen.has(name)) {
        throw new CommandUsageError(`${commandName}: Option "--help" may be supplied only once`);
      }
      seen.add(name);
      help = true;
      continue;
    }

    const definition = optionSchema[name];
    if (!definition) {
      throw new CommandUsageError(`${commandName}: Unknown option "${optionLabel(name)}"`);
    }
    if (seen.has(name)) {
      throw new CommandUsageError(
        `${commandName}: Option "${optionLabel(name)}" may be supplied only once`
      );
    }
    seen.add(name);

    if (definition.type === 'boolean') {
      values[name] = true;
      continue;
    }
    if (definition.type !== 'string') {
      throw new TypeError(`${commandName}: Unsupported option schema for "${name}"`);
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new CommandUsageError(`${commandName}: Option "${optionLabel(name)}" requires a value`);
    }
    index += 1;
    if (Array.isArray(definition.choices) && !definition.choices.includes(value)) {
      throw new CommandUsageError(
        `${commandName}: Unknown value "${value}" for "${optionLabel(name)}"; expected one of: ${definition.choices.join(', ')}`
      );
    }
    values[name] = value;
  }

  return { help, values };
}
