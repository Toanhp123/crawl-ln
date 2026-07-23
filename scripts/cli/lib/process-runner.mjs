import { spawn } from 'node:child_process';
import { CommandFailure, CommandInterrupted } from './errors.mjs';

const DEFAULT_TERMINATION_TIMEOUT_MS = 5_000;

function commandDescription(command, args) {
  return [command, ...args].join(' ');
}

function terminateChild(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
      return;
    }
  }
  child.kill(signal);
}

async function stopChild(child, closed, timeoutMs) {
  terminateChild(child, 'SIGTERM');
  let timer;
  const completed = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
      timer.unref?.();
    })
  ]);
  if (timer) clearTimeout(timer);
  if (!completed) {
    terminateChild(child, 'SIGKILL');
    await closed;
  }
}

export function runChild({
  command,
  args = [],
  cwd,
  env = process.env,
  stdio = 'inherit',
  signal,
  stage = 'command',
  terminationTimeoutMs = DEFAULT_TERMINATION_TIMEOUT_MS
}) {
  if (signal?.aborted) {
    return Promise.reject(new CommandInterrupted(`${stage} interrupted before start`));
  }

  return new Promise((resolveRun, rejectRun) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio,
        shell: false,
        windowsHide: true,
        detached: process.platform !== 'win32'
      });
    } catch (error) {
      rejectRun(new CommandFailure(`${stage} failed to start: ${error.message}`, { cause: error }));
      return;
    }

    let settled = false;
    let interrupted = false;
    const closed = new Promise((resolveClosed) => child.once('close', resolveClosed));

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
    };
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onAbort = () => {
      if (interrupted || settled) return;
      interrupted = true;
      void stopChild(child, closed, terminationTimeoutMs)
        .then(() => settle(rejectRun, new CommandInterrupted(`${stage} interrupted`)))
        .catch((error) =>
          settle(
            rejectRun,
            new CommandInterrupted(`${stage} interrupted during cleanup`, { cause: error })
          )
        );
    };
    const onError = (error) => {
      if (interrupted) return;
      settle(
        rejectRun,
        new CommandFailure(
          `${stage} failed to start (${commandDescription(command, args)}): ${error.message}`,
          { cause: error }
        )
      );
    };
    const onExit = (code, exitSignal) => {
      if (interrupted) return;
      if (code === 0) {
        settle(resolveRun);
        return;
      }
      const detail = exitSignal ? `signal ${exitSignal}` : `code ${code}`;
      settle(
        rejectRun,
        new CommandFailure(`${stage} failed with ${detail} (${commandDescription(command, args)})`)
      );
    };

    child.once('error', onError);
    child.once('exit', onExit);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function exitResultFor(child, stage) {
  let resolveExit;
  const exited = new Promise((resolve) => {
    resolveExit = resolve;
  });
  const closed = new Promise((resolve, reject) => {
    child.once('error', (error) => {
      resolveExit({ code: null, signal: null, error });
      reject(new CommandFailure(`${stage} failed to start: ${error.message}`, { cause: error }));
    });
    child.once('exit', (code, exitSignal) => {
      resolveExit({ code, signal: exitSignal });
      if (code === 0) {
        resolve();
        return;
      }
      const detail = exitSignal ? `signal ${exitSignal}` : `code ${code}`;
      reject(new CommandFailure(`${stage} stopped with ${detail}`));
    });
  });
  // Startup waits on this promise later, but attach a handler immediately so a
  // very fast child failure never becomes an unhandled rejection.
  closed.catch(() => undefined);
  return { exited, closed };
}

async function waitForExitOrTimeout(exited, timeoutMs) {
  let timer;
  const result = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
      timer.unref?.();
    })
  ]);
  if (timer) clearTimeout(timer);
  return result;
}

export async function startCooperativeNode({
  entry,
  args = [],
  cwd,
  env = process.env,
  readyTimeoutMs = 10_000,
  terminationTimeoutMs = DEFAULT_TERMINATION_TIMEOUT_MS,
  stage = 'cooperative Node service'
}) {
  let child;
  try {
    child = spawn(process.execPath, ['--experimental-sqlite', '--import', 'tsx', entry, ...args], {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      detached: process.platform !== 'win32'
    });
  } catch (error) {
    throw new CommandFailure(`${stage} failed to start: ${error.message}`, { cause: error });
  }

  const { exited, closed } = exitResultFor(child, stage);
  let closePromise;
  const close = () => {
    closePromise ??= (async () => {
      if (child.exitCode !== null || child.signalCode !== null) {
        await exited;
        return;
      }
      if (child.connected) {
        try {
          child.send({ type: 'shutdown' });
        } catch {
          // The child may disconnect between the connected check and send.
        }
      }
      if (await waitForExitOrTimeout(exited, terminationTimeoutMs)) return;
      terminateChild(child, 'SIGTERM');
      if (await waitForExitOrTimeout(exited, terminationTimeoutMs)) return;
      terminateChild(child, 'SIGKILL');
      await exited;
    })();
    return closePromise;
  };

  let readyTimer;
  const ready = new Promise((resolveReady, rejectReady) => {
    const cleanup = () => {
      if (readyTimer) clearTimeout(readyTimer);
      child.removeListener('message', onMessage);
    };
    const onMessage = (message) => {
      if (!message || message.type !== 'ready' || typeof message.url !== 'string') return;
      cleanup();
      resolveReady(message);
    };
    child.on('message', onMessage);
    readyTimer = setTimeout(() => {
      cleanup();
      rejectReady(new CommandFailure(`${stage} did not become ready within ${readyTimeoutMs}ms`));
    }, readyTimeoutMs);
    readyTimer.unref?.();
    closed.catch((error) => {
      cleanup();
      rejectReady(error);
    });
  });

  try {
    const message = await ready;
    return {
      pid: child.pid,
      url: message.url,
      closed,
      close
    };
  } catch (error) {
    await close().catch(() => undefined);
    throw error;
  }
}
