import { z } from 'zod';

const protocolVersion = z.literal(1);
const safeId = z.string().min(1).max(160);

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const boundedJsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string().max(200_000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(boundedJsonValue).max(256),
    z
      .record(boundedJsonValue)
      .refine((value) => Object.keys(value).length <= 128, 'Too many object properties')
  ])
);

const safeError = z
  .object({
    name: z.string().min(1).max(80),
    message: z.string().min(1).max(1_000),
    code: z.string().min(1).max(100).optional()
  })
  .strict();

export const hostToSandboxFrameSchema = z.discriminatedUnion('type', [
  z
    .object({
      protocolVersion,
      type: z.literal('request'),
      requestId: safeId,
      operation: z.enum([
        'initialize',
        'healthCheck',
        'shutdown',
        'probeCanHandle',
        'login',
        'resumeChallenge',
        'invokeCapability'
      ]),
      deadlineAt: z.string().datetime(),
      payload: z.record(boundedJsonValue)
    })
    .strict(),
  z
    .object({
      protocolVersion,
      type: z.literal('cancel'),
      requestId: safeId,
      reason: z.string().min(1).max(200)
    })
    .strict(),
  z
    .object({
      protocolVersion,
      type: z.literal('host-result'),
      requestId: safeId,
      callId: safeId,
      ok: z.boolean(),
      value: boundedJsonValue.optional(),
      error: safeError.optional()
    })
    .strict()
]);

export const sandboxToHostFrameSchema = z.discriminatedUnion('type', [
  z.object({ protocolVersion, type: z.literal('hello') }).strict(),
  z
    .object({
      protocolVersion,
      type: z.literal('response'),
      requestId: safeId,
      ok: z.boolean(),
      value: boundedJsonValue.optional(),
      error: safeError.optional()
    })
    .strict(),
  z
    .object({
      protocolVersion,
      type: z.literal('host-call'),
      requestId: safeId,
      callId: safeId,
      service: z.enum(['clock', 'http', 'html', 'url', 'cache', 'logger']),
      method: z.string().min(1).max(80),
      args: z.array(boundedJsonValue).max(8)
    })
    .strict()
]);
