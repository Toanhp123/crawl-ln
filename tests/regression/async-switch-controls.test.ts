import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('shared Switch owns async action feedback inside the thumb', () => {
  const source = read('apps/web/src/shared/ui/forms/Switch.tsx');

  assert.match(source, /actionState\?: ActionState/);
  assert.match(source, /feedbackPolicy\?: ActionFeedbackPolicyName/);
  assert.match(source, /useActionFeedback\(actionState, feedbackPolicy\)/);
  assert.match(source, /LoaderCircle/);
  assert.match(source, /Check/);
  assert.match(source, /CircleX/);
  assert.match(source, /data-feedback-phase=\{phase\}/);
  assert.match(source, /aria-busy=/);
});

test('automatic updates use an optimistic Switch instead of enable-disable buttons', () => {
  const panel = read('apps/web/src/features/auto-update/ui/AutoUpdatePanel.tsx');
  const model = read('apps/web/src/features/auto-update/model/useAutoUpdate.ts');

  assert.match(panel, /<Switch/);
  assert.match(panel, /checked=\{enabled\}/);
  assert.match(panel, /actionState=\{actionTarget === 'toggle' \? actionState : 'idle'\}/);
  assert.match(panel, /disabled=\{pending\}/);
  assert.doesNotMatch(panel, /autoUpdate\.enable'\)|autoUpdate\.disable'\)/);

  assert.match(model, /onMutate:/);
  assert.match(model, /cancelQueries/);
  assert.match(model, /setQueryData/);
  assert.match(model, /previousDetail/);
  assert.match(model, /onError:/);
  assert.match(model, /context\?\.previousDetail/);
});

test('source plugin enabled state uses an optimistic Switch with rollback', () => {
  const card = read('apps/web/src/pages/sources/ui/SourceProfileCard.tsx');
  const model = read('apps/web/src/pages/sources/model/useSourcesPage.ts');

  assert.match(card, /<Switch/);
  assert.match(card, /checked=\{plugin\.enabled\}/);
  assert.match(card, /actionState=\{actionState\}/);
  assert.match(card, /disabled=\{disabled\}/);
  assert.doesNotMatch(card, /sources\.enable|sources\.disable/);
  assert.doesNotMatch(card, /<Button/);

  assert.match(model, /onMutate:/);
  assert.match(model, /cancelQueries/);
  assert.match(model, /previousPlugins/);
  assert.match(model, /client\.setQueryData/);
  assert.match(model, /onError: \(error, _variables, context\)/);
  assert.match(model, /context\?\.previousPlugins/);
});
