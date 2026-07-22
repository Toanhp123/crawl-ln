import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'apps/web-legacy/src');
const layers = ['shared', 'entities', 'features', 'widgets', 'pages', 'app'];
const layerRank = new Map(layers.map((layer, index) => [layer, index]));
const slicedLayers = new Set(['entities', 'features', 'widgets', 'pages']);
const violations = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(target);
  }
  return files;
}

function importsFrom(source) {
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"](@\/[^'"]+)['"]/g,
    /\bimport\(\s*['"](@\/[^'"]+)['"]\s*\)/g
  ];
  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]));
}

for (const file of await walk(webRoot)) {
  const source = await readFile(file, 'utf8');
  const relativeToWeb = path.relative(webRoot, file).replaceAll('\\', '/');
  const relativeToRoot = path.relative(root, file).replaceAll('\\', '/');
  const [sourceLayer, sourceSlice] = relativeToWeb.split('/');
  const sourceRank = layerRank.get(sourceLayer);
  if (sourceRank === undefined) continue;

  for (const importedPath of importsFrom(source)) {
    const [targetLayer, targetSlice] = importedPath.slice(2).split('/');
    const targetRank = layerRank.get(targetLayer);
    if (targetRank === undefined) continue;

    if (sourceRank < targetRank) {
      violations.push(
        `${relativeToRoot}: ${sourceLayer} cannot import upward from ${targetLayer}: ${importedPath}`
      );
      continue;
    }

    if (
      sourceLayer === targetLayer &&
      slicedLayers.has(sourceLayer) &&
      sourceSlice &&
      targetSlice &&
      sourceSlice !== targetSlice
    ) {
      violations.push(
        `${relativeToRoot}: ${sourceLayer} slices must not cross-import (${sourceSlice} -> ${targetSlice}): ${importedPath}`
      );
    }
  }
}

if (violations.length) {
  console.error('Frontend FSD architecture check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Frontend FSD architecture check passed.');
