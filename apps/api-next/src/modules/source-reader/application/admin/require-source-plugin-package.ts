import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

export function requireSourcePluginPackage(
  file: { buffer: Uint8Array; originalname: string } | undefined
): { bytes: Uint8Array; originalName: string } {
  if (file) return { bytes: file.buffer, originalName: file.originalname };
  throw new SourceReaderError('PLUGIN_RESULT_INVALID', 'Plugin package is required', {
    retryable: false,
    fallbackAllowed: false
  });
}
