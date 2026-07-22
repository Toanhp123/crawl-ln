import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const packageJson = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string };

function gitBuildId(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return undefined;
  }
}

const buildId = process.env.APP_BUILD ?? gitBuildId() ?? packageJson.version;
const webNextSourceRoot = fileURLToPath(new URL('./src/', import.meta.url))
  .replaceAll('\\', '/')
  .replace(/\/$/, '');

const slicedSourceModulePattern = /^\/(?:entities|features)\/.*\.(?:cts|mts|ts|tsx)(?:\?.*)?$/;

// FSD slice modules are pure, so catalog imports can drop sibling UI/API re-exports.
export function webNextModuleSideEffects(id: string): boolean | undefined {
  const normalizedId = id.replaceAll('\\', '/');
  return normalizedId.startsWith(`${webNextSourceRoot}/`) &&
    slicedSourceModulePattern.test(normalizedId.slice(webNextSourceRoot.length))
    ? false
    : undefined;
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_BUILD__: JSON.stringify(buildId)
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      treeshake: {
        moduleSideEffects: webNextModuleSideEffects
      }
    }
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3100'
    }
  },
  preview: { port: 4174 }
});
