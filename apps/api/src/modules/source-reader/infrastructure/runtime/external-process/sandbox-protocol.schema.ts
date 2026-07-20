import { z } from 'zod';

const protocolVersion = z.literal(1);
const safeId = z.string().min(1).max(160);
const safeString = z.string().max(200_000);

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const boundedJsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    safeString,
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

const hostCallBase = {
  protocolVersion,
  type: z.literal('host-call'),
  requestId: safeId,
  callId: safeId
};

const hostCall = <S extends string, M extends string>(service: S, method: M, args: z.ZodTypeAny) =>
  z
    .object({
      ...hostCallBase,
      service: z.literal(service),
      method: z.literal(method),
      args
    })
    .strict();

const optionalStringTuple = z.union([z.tuple([safeId]), z.tuple([safeId, safeString])]);
const optionalJsonTuple = z.union([
  z.tuple([safeString]),
  z.tuple([safeString, boundedJsonValue.nullable()])
]);

const sandboxHostCallFrameSchema = z.union([
  hostCall('clock', 'now', z.tuple([])),
  hostCall('http', 'get', optionalJsonTuple),
  hostCall('html', 'load', z.tuple([safeString])),
  hostCall('html', 'text', z.tuple([safeId, safeString])),
  hostCall('html', 'attr', z.tuple([safeId, safeString, safeString])),
  hostCall('html', 'html', z.tuple([safeId, safeString])),
  hostCall('html', 'all', z.tuple([safeId, safeString])),
  hostCall('html', 'remove', z.tuple([safeId, safeString])),
  hostCall('html', 'nodeText', optionalStringTuple),
  hostCall('html', 'nodeAttr', z.tuple([safeId, safeString])),
  hostCall('html', 'nodeHtml', optionalStringTuple),
  hostCall('url', 'normalize', z.tuple([safeString])),
  hostCall('url', 'resolve', z.tuple([safeString, safeString])),
  hostCall('cache', 'get', z.tuple([safeString])),
  hostCall('cache', 'set', z.tuple([safeString, boundedJsonValue, z.number().int().nonnegative()])),
  hostCall('logger', 'info', optionalJsonTuple),
  hostCall('logger', 'warn', optionalJsonTuple),
  hostCall('browser', 'open', z.tuple([safeString])),
  hostCall('browser', 'waitFor', z.tuple([safeString])),
  hostCall('browser', 'text', z.tuple([safeString])),
  hostCall('browser', 'html', z.tuple([safeString])),
  hostCall('browser', 'click', z.tuple([safeString])),
  hostCall(
    'browser',
    'fillSecret',
    z.tuple([
      safeString,
      z.object({ credentialId: safeId, field: z.string().min(1).max(100) }).strict()
    ])
  ),
  hostCall('browser', 'cookies', z.tuple([]))
]);

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

export const sandboxToHostFrameSchema = z.union([
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
  sandboxHostCallFrameSchema
]);
