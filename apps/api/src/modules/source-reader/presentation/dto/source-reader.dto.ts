import { z } from 'zod';

export const sourceUrlRequestSchema = z.object({
  url: z.string().url(),
  credentialProfileId: z.string().min(1).optional(),
  networkProfileId: z.string().min(1).optional(),
  freshOnly: z.boolean().optional()
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
  routeType: z.enum(['direct', 'http-proxy', 'socks-proxy', 'vpn-gateway']),
  regions: z.array(z.string().min(2)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  config: z.record(z.unknown()).optional()
});

export const networkProfileUpdateSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    routeType: z.enum(['direct', 'http-proxy', 'socks-proxy', 'vpn-gateway']).optional(),
    regions: z.array(z.string().min(2)).optional(),
    tags: z.array(z.string().min(1)).optional(),
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const pluginVersionSchema = z.object({ version: z.string().min(1).max(100) });

export const authChallengeResponseSchema = z.object({
  response: z.discriminatedUnion('type', [
    z.object({ type: z.literal('otp'), code: z.string().min(1).max(32) }),
    z.object({ type: z.literal('approval'), approved: z.boolean() }),
    z.object({ type: z.literal('browser-interaction'), completed: z.boolean() })
  ])
});
