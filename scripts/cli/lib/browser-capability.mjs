import { CommandFailure } from './errors.mjs';
import { importFrom } from './module-loader.mjs';
import { npmInvocation } from './npm.mjs';
import { runChild } from './process-runner.mjs';
import { projectRoot } from './repository.mjs';
import { describePlatform, detectPlatform } from './platform.mjs';

function explicitExecutable(environment) {
  return (
    environment.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
    environment.SOURCE_READER_BROWSER_EXECUTABLE ||
    undefined
  );
}

export function browserInstallArguments(platformInfo) {
  return platformInfo.platform === 'linux' && platformInfo.libc === 'glibc'
    ? ['exec', '--', 'playwright', 'install', '--with-deps', 'chromium']
    : ['exec', '--', 'playwright', 'install', 'chromium'];
}

function requiresExplicitBrowser(platformInfo) {
  return (
    platformInfo.platform === 'android' ||
    (platformInfo.platform === 'linux' && platformInfo.libc !== 'glibc')
  );
}

export async function probeBrowserCapability({
  install = false,
  platformInfo = detectPlatform(),
  environment = process.env,
  root = projectRoot,
  signal
} = {}) {
  const executablePath = explicitExecutable(environment);
  if (!executablePath && requiresExplicitBrowser(platformInfo)) {
    throw new CommandFailure(
      `A compatible system Chromium executable is required for ${describePlatform(platformInfo)}. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH or SOURCE_READER_BROWSER_EXECUTABLE.`
    );
  }

  if (install && !executablePath) {
    const installArguments = browserInstallArguments(platformInfo);
    await runChild({
      ...npmInvocation(installArguments, environment),
      cwd: root,
      env: environment,
      stdio: 'inherit',
      signal,
      stage: 'browser installation'
    });
  }

  let browser;
  try {
    const playwrightModule = await importFrom(root, '@playwright/test');
    const playwright = playwrightModule.default ?? playwrightModule;
    const chromium = playwrightModule.chromium ?? playwright.chromium;
    if (!chromium || typeof chromium.launch !== 'function') {
      throw new Error('@playwright/test did not expose chromium.launch');
    }
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {})
    });
    const page = await browser.newPage();
    try {
      await page.goto('data:text/html,<title>Novel Tool browser probe</title>');
    } finally {
      await page.close();
    }
  } catch (error) {
    throw new CommandFailure(
      `Browser capability probe failed for ${describePlatform(platformInfo)}: ${error.message}`,
      { cause: error }
    );
  } finally {
    await browser?.close().catch(() => undefined);
  }

  return {
    mode: executablePath ? 'system' : 'managed',
    ...(executablePath ? { executablePath } : {})
  };
}
