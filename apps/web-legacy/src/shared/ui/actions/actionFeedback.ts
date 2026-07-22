export type ActionState = 'idle' | 'pending' | 'success' | 'error';
export type ActionFeedbackPhase = 'idle' | 'loading' | 'success' | 'error';
export type ActionFeedbackPolicyName = keyof typeof actionFeedbackPolicies;

export const actionFeedbackPolicies = {
  standard: {
    loadingDelayMs: 150,
    loadingMinDurationMs: 400,
    successDurationMs: 600,
    errorDurationMs: 900
  },
  immediate: {
    loadingDelayMs: 0,
    loadingMinDurationMs: 500,
    successDurationMs: 600,
    errorDurationMs: 900
  },
  longRunning: {
    loadingDelayMs: 100,
    loadingMinDurationMs: 600,
    successDurationMs: 800,
    errorDurationMs: 1_000
  }
} as const;

export interface ActionFeedbackScheduler {
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (timer: unknown) => void;
}

type ControllerOptions = {
  policy?: ActionFeedbackPolicyName;
  scheduler?: ActionFeedbackScheduler;
  onPhaseChange: (phase: ActionFeedbackPhase) => void;
};

const systemScheduler: ActionFeedbackScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>)
};

export function createActionFeedbackController({
  policy = 'standard',
  scheduler = systemScheduler,
  onPhaseChange
}: ControllerOptions) {
  const timing = actionFeedbackPolicies[policy];
  let actionState: ActionState = 'idle';
  let phase: ActionFeedbackPhase = 'idle';
  let cycleActive = false;
  let loadingStartedAt: number | null = null;
  let loadingDelayTimer: unknown;
  let settleTimer: unknown;
  let resetTimer: unknown;
  let disposed = false;

  const clearTimer = (timer: unknown) => {
    if (timer !== undefined) scheduler.clearTimeout(timer);
  };

  const clearTimers = () => {
    clearTimer(loadingDelayTimer);
    clearTimer(settleTimer);
    clearTimer(resetTimer);
    loadingDelayTimer = undefined;
    settleTimer = undefined;
    resetTimer = undefined;
  };

  const emit = (next: ActionFeedbackPhase) => {
    if (disposed || phase === next) return;
    phase = next;
    onPhaseChange(next);
  };

  const resetAfter = (durationMs: number) => {
    clearTimer(resetTimer);
    resetTimer = scheduler.setTimeout(() => {
      if (disposed || actionState === 'pending') return;
      emit('idle');
      cycleActive = false;
      loadingStartedAt = null;
    }, durationMs);
  };

  const showOutcome = (outcome: 'success' | 'error') => {
    if (disposed || actionState === 'pending') return;
    emit(outcome);
    resetAfter(outcome === 'success' ? timing.successDurationMs : timing.errorDurationMs);
  };

  const settle = (outcome: 'success' | 'error') => {
    clearTimer(loadingDelayTimer);
    loadingDelayTimer = undefined;
    if (!cycleActive) return;

    if (phase === 'loading' && loadingStartedAt !== null) {
      const elapsed = scheduler.now() - loadingStartedAt;
      const remaining = Math.max(0, timing.loadingMinDurationMs - elapsed);
      clearTimer(settleTimer);
      settleTimer = scheduler.setTimeout(() => showOutcome(outcome), remaining);
      return;
    }

    showOutcome(outcome);
  };

  return {
    getPhase: () => phase,
    update(next: ActionState) {
      if (disposed || next === actionState) return;
      const previous = actionState;
      actionState = next;

      if (next === 'pending') {
        clearTimers();
        cycleActive = true;
        loadingStartedAt = null;
        emit('idle');
        const beginLoading = () => {
          if (disposed || actionState !== 'pending') return;
          loadingStartedAt = scheduler.now();
          emit('loading');
        };
        if (timing.loadingDelayMs === 0) beginLoading();
        else loadingDelayTimer = scheduler.setTimeout(beginLoading, timing.loadingDelayMs);
        return;
      }

      if (next === 'success' || next === 'error') {
        settle(next);
        return;
      }

      if (next === 'idle' && previous === 'pending') {
        clearTimers();
        cycleActive = false;
        loadingStartedAt = null;
        emit('idle');
      }
    },
    dispose() {
      disposed = true;
      clearTimers();
    }
  };
}
