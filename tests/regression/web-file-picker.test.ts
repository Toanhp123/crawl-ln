import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const labels = {
  chooseLabel: 'Choose file',
  dropLabel: 'or drop it here',
  emptyLabel: 'No file selected',
  removeLabel: 'Remove selected file'
};

test('FilePicker renders an accessible empty file selection control', async () => {
  const { FilePicker } = await import('../../apps/web/src/shared/ui/forms/FilePicker.tsx');

  const html = renderToStaticMarkup(
    React.createElement(FilePicker, {
      id: 'plugin-archive',
      accept: '.zip,.source-plugin',
      ...labels,
      onChange() {}
    })
  );

  assert.match(html, /<input[^>]+id="plugin-archive"[^>]+type="file"/);
  assert.match(html, /accept="\.zip,\.source-plugin"/);
  assert.match(html, /<label[^>]+for="plugin-archive"/);
  assert.match(html, />Choose file</);
  assert.match(html, />or drop it here</);
  assert.match(html, />No file selected</);
  assert.doesNotMatch(html, /Remove selected file/);
});

test('FilePicker renders selected file metadata and a remove action', async () => {
  const { FilePicker } = await import('../../apps/web/src/shared/ui/forms/FilePicker.tsx');
  const file = new File(['plugin'], 'novelcool.zip', { type: 'application/zip' });

  const html = renderToStaticMarkup(
    React.createElement(FilePicker, {
      id: 'selected-plugin-archive',
      value: file,
      ...labels,
      onChange() {}
    })
  );

  assert.match(html, />novelcool\.zip</);
  assert.match(html, />6 B</);
  assert.match(html, /<button[^>]+aria-label="Remove selected file"/);
});

test('FilePicker associates errors and disables every file action', async () => {
  const { FilePicker } = await import('../../apps/web/src/shared/ui/forms/FilePicker.tsx');
  const file = new File(['plugin'], 'invalid.zip', { type: 'application/zip' });

  const html = renderToStaticMarkup(
    React.createElement(FilePicker, {
      id: 'invalid-plugin-archive',
      value: file,
      disabled: true,
      error: 'Archive is invalid',
      ...labels,
      onChange() {}
    })
  );

  assert.match(html, /<input[^>]+disabled=""[^>]+aria-describedby="invalid-plugin-archive-error"/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /<button[^>]+disabled=""[^>]+aria-label="Remove selected file"/);
  assert.match(html, /id="invalid-plugin-archive-error"[^>]+role="alert"/);
  assert.match(html, />Archive is invalid</);
});
