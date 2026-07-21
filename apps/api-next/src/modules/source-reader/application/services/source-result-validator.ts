import { z } from 'zod';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type {
  SourceReaderCandidate,
  SourceReaderResultValidatorPort
} from '../source-reader.ports.js';
import type { VersionedExtensionValue } from '../../public/source-reader.models.js';

const page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().optional(), hasMore: z.boolean() });

const schemas = {
  identify: z.object({
    normalizedUrl: z.string().url(),
    domain: z.string().min(1),
    pageType: z.enum(['novel', 'chapter', 'search', 'latest', 'unknown'])
  }),
  metadata: z.object({
    title: z.string().min(2),
    sourceUrl: z.string().url(),
    sourceName: z.string().min(1),
    author: z.string().optional(),
    coverUrl: z.string().url().optional(),
    description: z.string().optional(),
    status: z.enum(['ongoing', 'completed', 'hiatus', 'cancelled', 'unknown']).optional()
  }),
  'chapter-list': page(
    z.object({
      index: z.number().int().positive(),
      title: z.string().min(1),
      url: z.string().url(),
      publishedAt: z.string().optional()
    })
  ),
  'chapter-content': z.object({
    title: z.string().min(1),
    url: z.string().url(),
    rawText: z.string(),
    cleanText: z.string().min(1)
  }),
  search: page(
    z.object({
      title: z.string().min(1),
      url: z.string().url(),
      author: z.string().optional(),
      coverUrl: z.string().url().optional()
    })
  ),
  'latest-updates': page(
    z.object({
      novelTitle: z.string().min(1),
      novelUrl: z.string().url(),
      chapterTitle: z.string().optional(),
      chapterUrl: z.string().url().optional(),
      updatedAt: z.string().optional()
    })
  )
} as const;

export class SourceResultValidator implements SourceReaderResultValidatorPort {
  validate(
    capability: keyof typeof schemas,
    data: unknown,
    extensions?: Record<string, VersionedExtensionValue>,
    candidate?: SourceReaderCandidate
  ) {
    const result = schemas[capability].safeParse(data);
    if (!result.success) {
      throw new SourceReaderError(
        'PLUGIN_RESULT_INVALID',
        'Plugin returned invalid normalized data',
        {
          retryable: false,
          fallbackAllowed: true,
          details: { capability, issues: result.error.issues }
        }
      );
    }
    const contracts = candidate?.extensionContracts ?? {};
    const supplied = extensions ?? {};
    for (const namespace of Object.keys(supplied)) {
      if (!contracts[namespace]) {
        this.invalidExtension(namespace, [
          { path: '/', message: 'Extension namespace was not activated' }
        ]);
      }
    }

    const validated: Record<string, VersionedExtensionValue> = {};
    const warnings: Array<{ code: string; message: string }> = [];
    for (const [namespace, contract] of Object.entries(contracts).sort(([left], [right]) =>
      left.localeCompare(right)
    )) {
      const value = supplied[namespace];
      if (!value) {
        if (contract.required) {
          this.invalidExtension(namespace, [
            { path: '/', message: 'Required extension is missing' }
          ]);
        }
        continue;
      }
      const validation =
        String(value.version) === contract.version
          ? contract.validate(value.data)
          : {
              success: false as const,
              issues: [
                { path: '/version', message: `Expected extension version ${contract.version}` }
              ]
            };
      if (!validation.success) {
        if (contract.required) this.invalidExtension(namespace, validation.issues);
        warnings.push({
          code: 'PLUGIN_EXTENSION_OMITTED',
          message: `Optional extension ${namespace}@${contract.version} was omitted`
        });
        continue;
      }
      validated[namespace] = { version: value.version, data: validation.data };
    }

    return {
      data: result.data,
      ...(Object.keys(validated).length > 0 ? { extensions: validated } : {}),
      ...(warnings.length > 0 ? { warnings } : {})
    };
  }

  private invalidExtension(
    namespace: string,
    issues: Array<{ path: string; message: string }>
  ): never {
    throw new SourceReaderError(
      'PLUGIN_RESULT_INVALID',
      'Plugin returned an invalid extension result',
      {
        retryable: false,
        fallbackAllowed: true,
        details: { namespace, issues }
      }
    );
  }
}
