import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';

test('InlineNotice keeps the simple children-only contract', async () => {
  const { InlineNotice } = await import('../../apps/web/src/shared/ui/feedback/InlineNotice.tsx');

  const html = renderToStaticMarkup(
    createElement(InlineNotice, { tone: 'info' }, 'Current message')
  );

  assert.match(html, /role="status"/);
  assert.match(html, />Current message</);
});

test('InlineNotice supports a title and consumer-owned action slot', async () => {
  const { InlineNotice } = await import('../../apps/web/src/shared/ui/feedback/InlineNotice.tsx');

  const html = renderToStaticMarkup(
    createElement(
      InlineNotice,
      {
        tone: 'danger',
        title: 'Unable to load',
        action: createElement('button', { type: 'button' }, 'Retry')
      },
      'The service could not be reached.'
    )
  );

  assert.match(html, /role="alert"/);
  assert.match(html, />Unable to load</);
  assert.match(html, />The service could not be reached\.</);
  assert.match(html, /<button type="button">Retry<\/button>/);
});

test('ErrorBanner remains a thin InlineNotice danger wrapper', async () => {
  const source = await readFile('apps/web/src/shared/ui/feedback/ErrorBanner.tsx', 'utf8');

  assert.match(source, /<InlineNotice tone="danger">/);
  assert.match(source, /errorMessage\(error,\s*['"]common\.errorDescription['"]\)/);
  assert.doesNotMatch(source, /border-danger-state-border|bg-danger-subtle/);
});

test('StatusList renders semantic label-value rows and associated descriptions', async () => {
  const { StatusList } = await import('../../apps/web/src/shared/ui/data-display/StatusList.tsx');

  const html = renderToStaticMarkup(
    createElement(StatusList, {
      'aria-label': 'Scheduler status',
      items: [
        { key: 'state', label: 'Scheduler', value: 'Enabled' },
        {
          key: 'last',
          label: 'Last run',
          value: '2 minutes ago',
          description: 'Jul 24, 2026, 11:30 PM'
        }
      ]
    })
  );

  assert.match(html, /^<dl/);
  assert.equal((html.match(/<dt/g) ?? []).length, 2);
  assert.equal((html.match(/<dd/g) ?? []).length, 2);
  assert.match(html, />Scheduler</);
  assert.match(html, />2 minutes ago</);
  assert.match(html, />Jul 24, 2026, 11:30 PM</);
});
