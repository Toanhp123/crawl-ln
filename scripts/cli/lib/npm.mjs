import { CommandFailure } from './errors.mjs';

export function currentNpmCli(environment = process.env) {
  const npmExecPath = environment.npm_execpath;
  if (!npmExecPath) {
    throw new CommandFailure(
      'npm_execpath is unavailable. Run this command through npm, for example: npm run setup'
    );
  }
  return npmExecPath;
}

export function npmInvocation(args, environment = process.env) {
  return {
    command: process.execPath,
    args: [currentNpmCli(environment), ...args]
  };
}
