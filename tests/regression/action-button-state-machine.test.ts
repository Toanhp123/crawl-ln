import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  actionFeedbackPolicies,
  createActionFeedbackController,
  type ActionFeedbackPhase,
  type ActionFeedbackScheduler
} from '../../apps/web/src/shared/ui/actions/actionFeedback.ts';

class FakeScheduler implements ActionFeedbackScheduler {
  private current = 0;
  private nextId = 1;
  private timers = new Map<number, { at: number; callback: () => void }>();

  now = () => this.current;

  setTimeout = (callback: () => void, delay: number) => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.current + delay, callback });
    return id;
  };

  clearTimeout = (id: ReturnType<typeof setTimeout>) => {
    this.timers.delete(Number(id));
  };

  advance(ms: number) {
    const target = this.current + ms;
    while (true) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      const [id, timer] = next;
      this.timers.delete(id);
      this.current = timer.at;
      timer.callback();
    }
    this.current = target;
  }
}

function setup(policy: keyof typeof actionFeedbackPolicies = 'standard') {
  const scheduler = new FakeScheduler();
  const phases: ActionFeedbackPhase[] = [];
  const controller = createActionFeedbackController({
    policy,
    scheduler,
    onPhaseChange: (phase) => phases.push(phase)
  });
  return { controller, phases, scheduler };
}

test('a fast successful action skips spinner but still shows success feedback', () => {
  const { controller, phases, scheduler } = setup();

  controller.update('pending');
  scheduler.advance(100);
  controller.update('success');

  assert.deepEqual(phases, ['success']);
  scheduler.advance(actionFeedbackPolicies.standard.successDurationMs);
  assert.deepEqual(phases, ['success', 'idle']);
});

test('a slow successful action keeps spinner visible for the policy minimum', () => {
  const { controller, phases, scheduler } = setup();

  controller.update('pending');
  scheduler.advance(actionFeedbackPolicies.standard.loadingDelayMs);
  assert.deepEqual(phases, ['loading']);

  scheduler.advance(50);
  controller.update('success');
  scheduler.advance(actionFeedbackPolicies.standard.loadingMinDurationMs - 51);
  assert.deepEqual(phases, ['loading']);

  scheduler.advance(1);
  assert.deepEqual(phases, ['loading', 'success']);
});

test('failed actions show error feedback and never report success', () => {
  const { controller, phases, scheduler } = setup('immediate');

  controller.update('pending');
  assert.deepEqual(phases, ['loading']);
  controller.update('error');
  scheduler.advance(actionFeedbackPolicies.immediate.loadingMinDurationMs);

  assert.deepEqual(phases, ['loading', 'error']);
  assert.equal(phases.includes('success'), false);
});

test('disposing the controller cancels pending feedback timers', () => {
  const { controller, phases, scheduler } = setup();

  controller.update('pending');
  controller.dispose();
  scheduler.advance(5_000);

  assert.deepEqual(phases, []);
});

test('button feedback timing and outcome are centralized', () => {
  const button = readFileSync('apps/web/src/shared/ui/actions/Button.tsx', 'utf8');
  const sources = readFileSync('apps/web/src/pages/sources/ui/SourcesPage.tsx', 'utf8');
  const confirm = readFileSync('apps/web/src/shared/ui/overlay/ConfirmDialog.tsx', 'utf8');

  assert.match(button, /actionState\?: ActionState/);
  assert.match(button, /feedbackPolicy\?: ActionFeedbackPolicyName/);
  assert.match(button, /leadingIcon\?: ReactNode/);
  assert.doesNotMatch(button, /loadingDelayMs|loadingMinDurationMs|successDurationMs/);
  assert.doesNotMatch(button, /Children\.toArray|isValidElement/);

  assert.match(sources, /actionState=\{model\.reload\.status\}/);
  assert.match(sources, /feedbackPolicy="immediate"/);
  assert.doesNotMatch(sources, /loadingDelayMs|loadingMinDurationMs/);

  assert.match(confirm, /actionState\?: ActionState/);
  assert.doesNotMatch(confirm, /loading\?: boolean/);
});

test('source profile card has no nested interactive button', () => {
  const card = readFileSync('apps/web/src/pages/sources/ui/SourceProfileCard.tsx', 'utf8');

  assert.doesNotMatch(card, /event\.stopPropagation/);
  assert.match(card, /<div className="flex items-start justify-between gap-3">/);
  assert.match(card, /actionState=\{actionState\}/);
});
