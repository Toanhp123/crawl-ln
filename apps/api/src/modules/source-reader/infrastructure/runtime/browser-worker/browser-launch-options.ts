import type { LaunchOptions } from 'playwright-core';
import type { ResolvedNetworkRoute } from '../../../application/ports/network-route.port.js';

export function buildChromiumLaunchOptions(input: {
  browserExecutablePath?: string;
  route: ResolvedNetworkRoute;
}): LaunchOptions {
  return {
    headless: true,
    ...(input.browserExecutablePath ? { executablePath: input.browserExecutablePath } : {}),
    args: ['--disable-dev-shm-usage', '--no-sandbox'],
    ...(input.route.kind === 'direct'
      ? {}
      : {
          proxy: {
            server: input.route.endpoint,
            ...(input.route.username ? { username: input.route.username } : {}),
            ...(input.route.password ? { password: input.route.password } : {})
          }
        })
  };
}
