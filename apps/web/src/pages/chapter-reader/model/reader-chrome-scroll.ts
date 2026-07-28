export interface ReaderChromeScrollState {
  lastScrollTop: number;
  direction: 'idle' | 'up' | 'down';
  distance: number;
  visible: boolean;
}

const TOP_REVEAL_OFFSET = 72;
const UP_REVEAL_DISTANCE = 24;
const DOWN_HIDE_DISTANCE = 40;

export function createReaderChromeScrollState(
  scrollTop: number,
  visible = true
): ReaderChromeScrollState {
  return {
    lastScrollTop: Math.max(0, scrollTop),
    direction: 'idle',
    distance: 0,
    visible
  };
}

export function updateReaderChromeScrollState(
  state: ReaderChromeScrollState,
  scrollTop: number
): ReaderChromeScrollState {
  const nextScrollTop = Math.max(0, scrollTop);
  if (nextScrollTop <= TOP_REVEAL_OFFSET) {
    return {
      lastScrollTop: nextScrollTop,
      direction: 'idle',
      distance: 0,
      visible: true
    };
  }

  const delta = nextScrollTop - state.lastScrollTop;
  if (Math.abs(delta) < 1) return { ...state, lastScrollTop: nextScrollTop };

  const direction = delta > 0 ? 'down' : 'up';
  const distance =
    state.direction === direction ? state.distance + Math.abs(delta) : Math.abs(delta);
  const threshold = direction === 'up' ? UP_REVEAL_DISTANCE : DOWN_HIDE_DISTANCE;
  if (distance < threshold) {
    return { ...state, lastScrollTop: nextScrollTop, direction, distance };
  }

  return {
    lastScrollTop: nextScrollTop,
    direction,
    distance: 0,
    visible: direction === 'up'
  };
}
