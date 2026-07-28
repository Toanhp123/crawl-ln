import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createReaderChromeScrollState,
  updateReaderChromeScrollState
} from '../../apps/web/src/pages/chapter-reader/model/reader-chrome-scroll.ts';

test('reader chrome hides while scrolling down and reappears after a short upward gesture', () => {
  let state = createReaderChromeScrollState(0);

  state = updateReaderChromeScrollState(state, 120);
  assert.equal(state.visible, false);

  state = updateReaderChromeScrollState(state, 110);
  assert.equal(state.visible, false);

  state = updateReaderChromeScrollState(state, 94);
  assert.equal(state.visible, true);
});

test('reader chrome reveals immediately near the top without direction jitter', () => {
  let state = createReaderChromeScrollState(300, false);
  state = updateReaderChromeScrollState(state, 65);

  assert.deepEqual(state, {
    lastScrollTop: 65,
    direction: 'idle',
    distance: 0,
    visible: true
  });
});
