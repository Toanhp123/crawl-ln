export class CommandUsageError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'CommandUsageError';
    this.exitCode = 2;
  }
}

export class CommandFailure extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'CommandFailure';
    this.exitCode = 1;
  }
}

export class CommandInterrupted extends Error {
  constructor(message = 'Command interrupted', options) {
    super(message, options);
    this.name = 'CommandInterrupted';
    this.exitCode = 130;
  }
}

export function exitCodeFor(error) {
  return Number.isInteger(error?.exitCode) ? error.exitCode : 1;
}
