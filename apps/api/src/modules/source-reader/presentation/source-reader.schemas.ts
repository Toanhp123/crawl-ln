import type { Request } from 'express';
import { z } from 'zod';

export const sourceUrlRequestSchema = z.object({
  url: z.string().url(),
  credentialProfileId: z.string().min(1).optional(),
  networkProfileId: z.string().min(1).optional(),
  freshOnly: z.boolean().optional(),
  timeoutMs: z.number().int().min(1).max(120_000).optional()
});

export const chapterListRequestSchema = sourceUrlRequestSchema.extend({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(500).optional()
});

export const searchRequestSchema = sourceUrlRequestSchema.extend({
  query: z.string().min(1).max(200),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional()
});

export const credentialRequestSchema = z.object({
  ownerType: z.enum(['system', 'user']),
  pluginId: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  name: z.string().min(1).max(100),
  strategy: z.enum(['cookie-import', 'bearer-token', 'basic-auth', 'form-login', 'custom']),
  secret: z.record(z.unknown())
});

export const credentialSecretSchema = z.object({
  secret: z.record(z.unknown())
});

export const credentialLoginSchema = z.object({
  networkProfileId: z.string().min(1).optional()
});

export const networkProfileCreateSchema = z.object({
  ownerType: z.enum(['system', 'user']),
  name: z.string().min(1).max(100),
  routeType: z.enum(['direct', 'http-proxy', 'https-proxy', 'socks-proxy']),
  regions: z.array(z.string().min(2)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  config: z.record(z.unknown()).optional()
});

export const networkProfileUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    routeType: z.enum(['direct', 'http-proxy', 'https-proxy', 'socks-proxy']).optional(),
    regions: z.array(z.string().min(2)).optional(),
    tags: z.array(z.string().min(1)).optional(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const pluginVersionSchema = z.object({ version: z.string().min(1).max(100) });

const pluginStudioCapabilitySchema = z.enum([
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content'
]);

const pluginStudioSelectorsSchema = z
  .object({
    title: z.string().max(500).optional(),
    author: z.string().max(500).optional(),
    cover: z.string().max(500).optional(),
    description: z.string().max(500).optional(),
    chapterList: z.string().max(500).optional(),
    chapterContent: z.string().max(500).optional()
  })
  .strict();

export const pluginStudioCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    pluginId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/),
    hosts: z.array(z.string().min(1).max(253)).min(1).max(20),
    capabilities: z.array(pluginStudioCapabilitySchema).min(1),
    selectors: pluginStudioSelectorsSchema.default({})
  })
  .strict();

export const pluginStudioUpdateSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    name: z.string().trim().min(1).max(100).optional(),
    pluginId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .optional(),
    version: z
      .string()
      .regex(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
      .optional(),
    hosts: z.array(z.string().min(1).max(253)).min(1).max(20).optional(),
    capabilities: z.array(pluginStudioCapabilitySchema).min(1).optional(),
    selectors: pluginStudioSelectorsSchema.optional(),
    files: z
      .record(z.string().min(1).max(300), z.string())
      .superRefine((files, context) => {
        if (Object.keys(files).length > 50) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: 'Too many project files' });
        }
        const bytes = Object.values(files).reduce(
          (total, value) => total + Buffer.byteLength(value),
          0
        );
        if (bytes > 2 * 1024 * 1024) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Project source exceeds 2 MiB'
          });
        }
      })
      .optional()
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== 'expectedRevision'), {
    message: 'At least one project field is required'
  });

export const authChallengeResponseSchema = z.object({
  response: z.discriminatedUnion('type', [
    z.object({ type: z.literal('otp'), code: z.string().min(1).max(32) }),
    z.object({ type: z.literal('approval'), approved: z.boolean() }),
    z.object({ type: z.literal('browser-interaction'), completed: z.boolean() })
  ])
});

export function parseBody<T extends z.ZodTypeAny>(request: Request, schema: T): z.infer<T> {
  return schema.parse(request.body);
}
