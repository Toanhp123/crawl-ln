import { z } from 'zod';
import type { SourcePluginManifest } from './source-plugin.js';

const capability = z.enum([
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content',
  'search',
  'latest-updates',
  'authentication'
]);

const manifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
    description: z.string().optional(),
    engines: z.object({ sourceReader: z.string().min(1) }),
    capabilities: z.array(capability).min(1),
    contracts: z.record(capability, z.number().int().positive()).default({}),
    matchers: z
      .array(
        z.object({
          hosts: z.array(z.string().min(1)).min(1),
          include: z.array(z.string().min(1)).optional(),
          exclude: z.array(z.string().min(1)).optional(),
          capabilities: z.array(capability).optional(),
          priority: z.number().int()
        })
      )
      .min(1),
    runtime: z.object({
      preferredMode: z.enum(['in-process', 'isolated']),
      requiresBrowser: z.boolean().optional()
    }),
    permissions: z.object({
      network: z.object({ hosts: z.array(z.string().min(1)).min(1) }),
      browser: z.boolean().optional(),
      authentication: z.boolean().optional(),
      persistentCache: z.boolean().optional(),
      externalAssets: z.array(z.string().min(1)).optional()
    }),
    runtimeRequirements: z
      .object({
        authentication: z
          .object({
            required: z.boolean(),
            methods: z
              .array(
                z.enum(['cookie-import', 'bearer-token', 'basic-auth', 'form-login', 'custom'])
              )
              .min(1)
          })
          .optional(),
        network: z
          .object({
            required: z.boolean(),
            regions: z.array(z.string().min(2)).optional(),
            routeTags: z.array(z.string().min(1)).optional(),
            allowDirectFallback: z.boolean()
          })
          .optional()
      })
      .optional(),
    extensionContracts: z
      .record(
        z.string().min(1),
        z.object({
          version: z.number().int().positive(),
          schema: z.string().min(1),
          required: z.boolean().optional()
        })
      )
      .optional()
  })
  .superRefine((manifest, context) => {
    for (const item of manifest.capabilities) {
      if (item === 'authentication') continue;
      if (!manifest.contracts[item]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contracts', item],
          message: `Missing contract version for ${item}`
        });
      }
    }
  });

export function parseSourcePluginManifest(input: unknown): SourcePluginManifest {
  return manifestSchema.parse(input) as SourcePluginManifest;
}
