import { load } from 'cheerio';
import type {
  ExternalPluginContext,
  ExternalPluginHtmlDocument,
  ExternalPluginHtmlNode
} from '@novel-tool/source-plugin-sdk';

interface FixtureResponse {
  url?: string;
  status?: number;
  data: string;
}

function cleanText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function createCheerioDocument(source: string): ExternalPluginHtmlDocument {
  const $ = load(source);

  function htmlNode(element: Parameters<typeof $>[0]): ExternalPluginHtmlNode {
    const node = $(element);
    return {
      async text(selector) {
        return cleanText(selector ? node.find(selector).first().text() : node.text());
      },
      async attr(name) {
        return node.attr(name);
      },
      async html(selector) {
        return (selector ? node.find(selector).first().html() : node.html()) ?? '';
      }
    };
  }

  return {
    async text(selector) {
      return cleanText($(selector).first().text());
    },
    async attr(selector, name) {
      return $(selector).first().attr(name);
    },
    async html(selector) {
      return $(selector).first().html() ?? '';
    },
    async all(selector) {
      return $(selector)
        .toArray()
        .map((element) => htmlNode(element));
    },
    async remove(selector) {
      $(selector).remove();
    }
  };
}

export function createExternalContextFixture(
  input: {
    responses?: Record<string, FixtureResponse>;
    normalizedUrl?: string;
  } = {}
) {
  const requests: string[] = [];
  const logs: Array<{
    level: 'info' | 'warn';
    message: string;
    metadata?: Record<string, unknown>;
  }> = [];
  let aborted = false;
  let afterRequestHook: (() => void) | undefined;

  const context: ExternalPluginContext = {
    http: {
      async get(url) {
        requests.push(url);
        const response = input.responses?.[url];
        if (!response) throw new Error(`Unexpected request: ${url}`);
        afterRequestHook?.();
        return {
          url: response.url ?? url,
          status: response.status ?? 200,
          headers: {},
          data: response.data
        };
      }
    },
    html: { load: createCheerioDocument },
    url: {
      async normalize(value) {
        const url = new URL(value);
        url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
        url.hash = '';
        return url.toString();
      },
      async resolve(value, base) {
        return new URL(value, base).toString();
      }
    },
    cache: {
      async get() {
        return undefined;
      },
      async set() {}
    },
    logger: {
      async info(message, metadata) {
        logs.push({ level: 'info', message, metadata });
      },
      async warn(message, metadata) {
        logs.push({ level: 'warn', message, metadata });
      }
    },
    clock: { now: () => '2026-07-26T00:00:00.000Z' },
    host: {
      async clockNow() {
        return '2026-07-26T00:00:00.000Z';
      }
    },
    signal: {
      get aborted() {
        return aborted;
      }
    },
    normalizedUrl: input.normalizedUrl ?? ''
  };

  return {
    context,
    requests,
    logs,
    abort() {
      aborted = true;
    },
    afterRequest(hook: () => void) {
      afterRequestHook = hook;
    }
  };
}
