import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname } from 'node:path';

const DEFAULT_LOG_LIMIT = 2 * 1024 * 1024;

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function completesWithin(promise, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    promise.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export function redactSecrets(value, secretValues = []) {
  let redacted = value;
  for (const secret of secretValues.filter(Boolean)) {
    redacted = redacted.split(secret).join('[REDACTED]');
  }
  return redacted
    .replace(
      /((?:SOURCE_READER_MASTER_KEY|API_REMOTE_TOKEN|AUTHORIZATION|PASSWORD|SECRET|TOKEN)\s*[=:]\s*)[^\s,;]+/gi,
      '$1[REDACTED]'
    )
    .replace(
      /("(?:authorization|cookie|password|secret|token)"\s*:\s*")[^"]*(")/gi,
      '$1[REDACTED]$2'
    );
}

export function reserveLoopbackPort(port = 0) {
  return new Promise((resolveReservation, rejectReservation) => {
    const server = createServer();
    server.once('error', rejectReservation);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        rejectReservation(new Error('Loopback port reservation did not bind'));
        return;
      }
      let released = false;
      resolveReservation({
        port: address.port,
        release() {
          if (released) return Promise.resolve();
          released = true;
          return new Promise((resolveRelease, rejectRelease) =>
            server.close((error) => (error ? rejectRelease(error) : resolveRelease()))
          );
        }
      });
    });
  });
}

export async function waitForHttp(
  url,
  { timeoutMs = 15_000, intervalMs = 100, requestTimeoutMs = 1_000, accept } = {}
) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
      if (accept ? await accept(response) : response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }
  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${url}${detail}`);
}

export async function startManagedProcess({
  name,
  command,
  args = [],
  cwd,
  env,
  logPath,
  secretValues = [],
  maxLogBytes = DEFAULT_LOG_LIMIT
}) {
  await mkdir(dirname(logPath), { recursive: true });
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const streams = { stdout: [], stderr: [], process: [] };
  let capturedBytes = 0;
  let truncated = false;

  const capture = (stream, chunk) => {
    if (capturedBytes >= maxLogBytes) {
      truncated = true;
      return;
    }
    const content = String(chunk);
    const remaining = maxLogBytes - capturedBytes;
    const bounded = Buffer.from(content).subarray(0, remaining).toString();
    capturedBytes += Buffer.byteLength(bounded);
    streams[stream].push(bounded);
    if (Buffer.byteLength(content) > remaining) truncated = true;
  };
  child.stdout?.on('data', (chunk) => capture('stdout', chunk));
  child.stderr?.on('data', (chunk) => capture('stderr', chunk));

  const exited = new Promise((resolveExit) => {
    child.once('error', (error) => {
      capture('process', `${error.stack ?? error.message}\n`);
      resolveExit({ code: null, signal: null, error });
    });
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
  let stopped = false;

  async function flushLogs() {
    const suffix = truncated ? '\n[process] log truncated\n' : '';
    const content =
      Object.entries(streams)
        .filter(([, chunks]) => chunks.length > 0)
        .map(([stream, chunks]) => `[${stream}] ${redactSecrets(chunks.join(''), secretValues)}`)
        .join('') + suffix;
    await writeFile(logPath, content, 'utf8');
  }

  return {
    name,
    child,
    exited,
    async stop({ timeoutMs = 5_000 } = {}) {
      if (stopped) return;
      stopped = true;
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      const completed = await completesWithin(exited, timeoutMs);
      if (!completed && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exited;
      }
      await flushLogs();
    }
  };
}
