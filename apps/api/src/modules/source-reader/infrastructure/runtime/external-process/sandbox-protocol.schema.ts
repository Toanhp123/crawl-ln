import { z } from 'zod';

const protocolVersion = z.literal(1);
const safeId = z.string().min(1).max(160);
const safeString = z.string().max(200_000);

const MAX_PROTOCOL_DEPTH = 32;
const MAX_PROTOCOL_NODES = 10_000;
const MAX_PROTOCOL_BYTES = 512_000;

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

type ProtocolParseResult<T> = { success: true; data: T } | { success: false };

function isProtocolFrameWithinBounds(root: unknown): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  const seen = new WeakSet<object>();
  let nodes = 0;
  let bytes = 0;

  try {
    while (stack.length > 0) {
      const current = stack.pop()!;
      nodes += 1;
      if (nodes > MAX_PROTOCOL_NODES || current.depth > MAX_PROTOCOL_DEPTH) return false;

      const value = current.value;
      if (value === null) {
        bytes += 4;
      } else if (typeof value === 'string') {
        bytes += Buffer.byteLength(value, 'utf8') + 2;
      } else if (typeof value === 'number') {
        bytes += 24;
      } else if (typeof value === 'boolean') {
        bytes += 5;
      } else if (typeof value === 'undefined') {
        // Optional top-level protocol properties may be present with undefined; Zod decides validity.
        bytes += 0;
      } else if (typeof value === 'object') {
        if (seen.has(value)) return false;
        seen.add(value);
        if (Array.isArray(value)) {
          bytes += value.length + 2;
          for (const child of value) stack.push({ value: child, depth: current.depth + 1 });
        } else {
          const prototype = Object.getPrototypeOf(value);
          if (prototype !== Object.prototype && prototype !== null) return false;
          const keys = Object.keys(value);
          if (Reflect.ownKeys(value).length !== keys.length) return false;
          bytes += keys.length + 2;
          for (const key of keys) {
            bytes += Buffer.byteLength(key, 'utf8') + 3;
            stack.push({
              value: (value as Record<string, unknown>)[key],
              depth: current.depth + 1
            });
          }
        }
      } else {
        return false;
      }

      if (bytes > MAX_PROTOCOL_BYTES) return false;
    }
  } catch {
    return false;
  }

  return true;
}

function parseBounded<T>(schema: z.ZodType<T>, value: unknown): ProtocolParseResult<T> {
  if (!isProtocolFrameWithinBounds(value)) return { success: false };
  try {
    const parsed = schema.safeParse(value);
    return parsed.success ? { success: true, data: parsed.data } : { success: false };
  } catch {
    return { success: false };
  }
}

export function parseHostToSandboxFrame(
  value: unknown
): ProtocolParseResult<z.infer<typeof hostToSandboxFrameSchema>> {
  return parseBounded(hostToSandboxFrameSchema, value);
}

export function parseSandboxToHostFrame(
  value: unknown
): ProtocolParseResult<z.infer<typeof sandboxToHostFrameSchema>> {
  return parseBounded(sandboxToHostFrameSchema, value);
}
