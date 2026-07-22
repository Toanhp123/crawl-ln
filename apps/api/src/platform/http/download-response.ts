import type { Response } from 'express';

export function sendDownload(
  response: Response,
  artifact: { filename: string; contentType: string; content: Buffer },
  headers: Record<string, string> = {}
) {
  response.setHeader('Content-Disposition', `attachment; filename="${artifact.filename}"`);
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  return response.type(artifact.contentType).send(artifact.content);
}
