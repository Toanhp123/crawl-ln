import type {
  PluginInvocation,
  PluginRuntimePort
} from '../../../application/ports/plugin-runtime.port.js';
import { SourceReaderError } from '../../../domain/errors/source-reader.error.js';
import type { PluginContext, PluginOperationResult } from '../../../domain/plugin/source-plugin.js';

const methodByCapability = {
  identify: 'identify',
  metadata: 'readMetadata',
  'chapter-list': 'readChapterList',
  'chapter-content': 'readChapterContent',
  search: 'search',
  'latest-updates': 'latestUpdates'
} as const;

export class InProcessPluginRuntime implements PluginRuntimePort {
  async invoke(invocation: PluginInvocation) {
    if (invocation.capability === 'authentication') {
      throw new SourceReaderError(
        'CAPABILITY_NOT_SUPPORTED',
        'Authentication is invoked through the authentication runtime',
        { retryable: false, fallbackAllowed: false }
      );
    }

    const methodName = methodByCapability[invocation.capability];
    const method = invocation.registration.plugin[methodName] as
      | ((
          request: Record<string, unknown>,
          context: PluginContext
        ) => Promise<PluginOperationResult<unknown>>)
      | undefined;
    if (typeof method !== 'function') {
      throw new SourceReaderError(
        'CAPABILITY_NOT_SUPPORTED',
        `${invocation.registration.plugin.manifest.id} does not implement ${invocation.capability}`,
        { retryable: false, fallbackAllowed: true }
      );
    }
    if (invocation.context.signal?.aborted) {
      throw new SourceReaderError('SOURCE_READER_CANCELLED', 'Request cancelled', {
        retryable: false,
        fallbackAllowed: false
      });
    }

    return method.call(invocation.registration.plugin, invocation.request, invocation.context);
  }
}
