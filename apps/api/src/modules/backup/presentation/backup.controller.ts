import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { accepted, ok } from '../../../platform/http/api-response.js';
import type { BackupApi } from '../public/backup.api.js';
import { toBackupOperationSummary } from './backup-operation.presenter.js';

const startBackupOperationSchema = z
  .object({
    kind: z.literal('backup'),
    encryption: z.discriminatedUnion('enabled', [
      z.object({ enabled: z.literal(true), password: z.string().max(256) }).strict(),
      z.object({ enabled: z.literal(false) }).strict()
    ]),
    confirmation: z.object({ unencryptedAccepted: z.boolean() }).strict(),
    settings: z.record(z.unknown()).default({})
  })
  .strict();

const operationParamsSchema = z.object({ operationId: z.string().min(1).max(200) }).strict();
const tokenParamsSchema = z.object({ token: z.string().min(1).max(512) }).strict();
const downloadTokenSchema = z.object({ artifactId: z.string().min(1).max(200) }).strict();
const idempotencyKeySchema = z.string().min(1).max(200);

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function backupRequestFingerprint(input: z.infer<typeof startBackupOperationSchema>): string {
  return sha256(
    stableJson({
      kind: input.kind,
      encryption: input.encryption.enabled ? 'enabled' : 'disabled',
      settingsSha256: sha256(stableJson(input.settings)),
      confirmation: input.confirmation.unencryptedAccepted ? 'accepted' : 'not-accepted'
    })
  );
}

function contentDisposition(filename: string): string {
  const ascii =
    filename
      .replace(/[\r\n"\\]/g, '_')
      .replace(/[^\x20-\x7e]/g, '_')
      .trim() || 'backup.nvt';
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function pipeDownload(stream: NodeJS.ReadableStream, response: Response): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.once('error', reject);
    response.once('finish', resolve);
    response.once('close', resolve);
    stream.pipe(response);
  });
}

export class BackupController {
  constructor(private readonly api: BackupApi) {}

  startOperation = async (request: Request, response: Response) => {
    const idempotencyKey = idempotencyKeySchema.parse(request.header('idempotency-key'));
    const input = startBackupOperationSchema.parse(request.body);
    const operation = this.api.operations.startBackup({
      idempotencyKey,
      requestFingerprint: backupRequestFingerprint(input),
      encryption: input.encryption,
      confirmation: input.confirmation,
      settings: input.settings
    });
    return accepted(response, toBackupOperationSummary(operation));
  };

  currentOperation = async (_request: Request, response: Response) => {
    const operation = this.api.operations.current();
    return ok(response, {
      operation: operation ? toBackupOperationSummary(operation) : null
    });
  };

  readOperation = async (request: Request, response: Response) => {
    const { operationId } = operationParamsSchema.parse(request.params);
    return ok(response, toBackupOperationSummary(this.api.operations.read(operationId)));
  };

  cancelOperation = async (request: Request, response: Response) => {
    const { operationId } = operationParamsSchema.parse(request.params);
    return ok(response, toBackupOperationSummary(this.api.operations.cancel(operationId)));
  };

  issueDownloadToken = async (request: Request, response: Response) => {
    const { operationId } = operationParamsSchema.parse(request.params);
    const { artifactId } = downloadTokenSchema.parse(request.body);
    return ok(response, await this.api.operations.issueDownloadToken(operationId, artifactId));
  };

  download = async (request: Request, response: Response) => {
    const { token } = tokenParamsSchema.parse(request.params);
    const download = this.api.operations.acceptDownloadToken(token);
    response.status(200);
    response.setHeader('Content-Type', 'application/vnd.novel-tool.backup');
    response.setHeader('Content-Disposition', contentDisposition(download.filename));
    response.setHeader('Content-Length', String(download.sizeBytes));
    await pipeDownload(download.stream, response);
  };
}
