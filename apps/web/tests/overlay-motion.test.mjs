import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appStyles = await readFile(new URL('../src/app/styles/index.css', import.meta.url), 'utf8');
const themeIndex = await readFile(new URL('../src/shared/theme/index.css', import.meta.url), 'utf8');
const motionPrimitives = await readFile(
  new URL('../src/shared/theme/motion-primitives.css', import.meta.url),
  'utf8'
);
const bottomSheet = await readFile(
  new URL('../src/shared/ui/overlay/BottomSheet.tsx', import.meta.url),
  'utf8'
);
const toast = await readFile(new URL('../src/shared/ui/feedback/Toast.tsx', import.meta.url), 'utf8');

test('shared theme owns reusable overlay motion primitives', () => {
  assert.match(themeIndex, /@import '\.\/motion-primitives\.css';/);
  assert.match(motionPrimitives, /\.motion-overlay-fade\[data-state='open'\]/);
  assert.match(motionPrimitives, /\.motion-sheet-slide-up\[data-state='closed'\]/);
  assert.doesNotMatch(appStyles, /@keyframes (sheet|toast)-/);
});

test('bottom sheet consumes shared motion primitives only', () => {
  assert.match(bottomSheet, /motion-overlay-fade/);
  assert.match(bottomSheet, /motion-sheet-slide-up/);
  assert.doesNotMatch(bottomSheet, /sheet-overlay-motion|sheet-content-motion/);
});

test('toast consumes the shared toast motion primitive with swipe states', () => {
  assert.match(toast, /motion-toast-slide-inline/);
  assert.match(motionPrimitives, /\.motion-toast-slide-inline\[data-state='open'\]/);
  assert.match(motionPrimitives, /\.motion-toast-slide-inline\[data-swipe='move'\]/);
  assert.match(motionPrimitives, /\.motion-toast-slide-inline\[data-swipe='end'\]/);
});

test('shared motion primitives rely on global reduced-motion tokens', () => {
  assert.match(motionPrimitives, /var\(--motion-normal\)/);
  assert.match(motionPrimitives, /var\(--ease-emphasized\)/);
  assert.doesNotMatch(motionPrimitives, /@media \(prefers-reduced-motion: reduce\)/);
});
