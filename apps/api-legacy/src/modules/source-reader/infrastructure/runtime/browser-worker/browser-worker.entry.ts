import { randomUUID } from 'node:crypto';
import { parentPort, workerData } from 'node:worker_threads';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { ResolvedNetworkRoute } from '../../../application/ports/network-route.port.js';
import { buildChromiumLaunchOptions } from './browser-launch-options.js';
import type { BrowserCommand, BrowserEvent } from './browser-protocol.js';

if (!parentPort) throw new Error('Browser worker requires parentPort');

const data = workerData as {
  browserExecutablePath?: string;
  allowedHosts: string[];
  route: ResolvedNetworkRoute;
};
const allowedHosts = data.allowedHosts.map((host) => host.toLowerCase().replace(/^\*\./, ''));
let browser: Browser;
let context: BrowserContext;
let page: Page;
const pendingSecrets = new Map<
  string,
  { resolve(value: string): void; reject(error: Error): void }
>();

function hostAllowed(url: string): boolean {
  const hostname = new URL(url).hostname.toLowerCase();
  return allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function requestParentSecret(handle: { credentialId: string; field: string }): Promise<string> {
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    pendingSecrets.set(requestId, { resolve, reject });
    parentPort!.postMessage({ type: 'resolve-secret', requestId, handle } satisfies BrowserEvent);
  });
}

async function initialize(): Promise<void> {
  browser = await chromium.launch(
    buildChromiumLaunchOptions({
      browserExecutablePath: data.browserExecutablePath,
      route: data.route
    })
  );
  context = await browser.newContext({ acceptDownloads: false });
  page = await context.newPage();
  page.on('download', (download) => void download.cancel());
  await page.route('**/*', async (route) => {
    if (!hostAllowed(route.request().url())) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  parentPort!.postMessage({ type: 'ready' } satisfies BrowserEvent);
}

async function execute(command: Extract<BrowserCommand, { type: 'command' }>): Promise<unknown> {
  switch (command.operation) {
    case 'open':
      if (!hostAllowed(command.url)) throw new Error('Browser navigation host is not approved');
      await page.goto(command.url, { waitUntil: 'domcontentloaded' });
      return undefined;
    case 'wait-for':
      await page.waitForSelector(command.selector);
      return undefined;
    case 'text':
      return page.locator(command.selector).first().textContent();
    case 'html':
      return page.locator(command.selector).first().innerHTML();
    case 'click':
      await page.locator(command.selector).first().click();
      return undefined;
    case 'fill-secret': {
      let secret = await requestParentSecret(command.handle);
      try {
        await page.locator(command.selector).first().fill(secret);
      } finally {
        secret = '';
      }
      return undefined;
    }
    case 'cookies':
      return context.cookies();
    case 'close':
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      return undefined;
  }
}

parentPort.on('message', (message: BrowserCommand) => {
  if (message.type === 'secret-result') {
    const pending = pendingSecrets.get(message.requestId);
    if (!pending) return;
    pendingSecrets.delete(message.requestId);
    if (message.ok) pending.resolve(message.value);
    else pending.reject(new Error(message.error));
    return;
  }

  void execute(message)
    .then((value) => {
      parentPort!.postMessage({
        type: 'result',
        id: message.id,
        ok: true,
        value
      } satisfies BrowserEvent);
    })
    .catch((error) => {
      parentPort!.postMessage({
        type: 'result',
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      } satisfies BrowserEvent);
    });
});

await initialize();
