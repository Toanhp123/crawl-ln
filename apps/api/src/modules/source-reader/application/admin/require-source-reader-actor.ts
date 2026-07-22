import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type { SourceReaderActor } from '../../public/source-reader.api.js';

export function requireSourceReaderActor(actor: SourceReaderActor | undefined): SourceReaderActor {
  if (actor) return actor;
  throw new SourceReaderError('PLUGIN_PERMISSION_DENIED', 'Source Reader actor is unavailable', {
    retryable: false,
    fallbackAllowed: false
  });
}
