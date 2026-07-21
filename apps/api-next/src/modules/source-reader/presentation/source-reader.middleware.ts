import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ApiAccessRequest } from '../../../platform/http/api-access.middleware.js';
import type { SourceReaderActor, SourceReaderRole } from '../public/source-reader.api.js';

const allRoles: SourceReaderRole[] = ['reader', 'source-manager', 'source-admin', 'system-admin'];
const roleSet = new Set<SourceReaderRole>(allRoles);

export interface SourceReaderRequest extends Request, ApiAccessRequest {
  sourceReaderActor?: SourceReaderActor;
  sourceReaderRequestId?: string;
}

export function sourceReaderRequestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const requestId = request.header('x-request-id') || randomUUID();
  (request as SourceReaderRequest).sourceReaderRequestId = requestId;
  response.locals.sourceReaderRequestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}

export function sourceReaderActorMiddleware(options: {
  localAdminEnabled: boolean;
  trustRoleHeaders: boolean;
}) {
  return (request: SourceReaderRequest, _response: Response, next: NextFunction): void => {
    const access = request.apiAccess ?? { isLocal: false, authenticated: false };
    const requestedId = request.header('x-source-reader-user-id') || undefined;
    const trustedRemoteActor = !access.isLocal && options.trustRoleHeaders && access.authenticated;
    const id = access.isLocal
      ? (requestedId ?? 'local-user')
      : trustedRemoteActor
        ? requestedId
        : undefined;
    const requested = request
      .header('x-source-reader-roles')
      ?.split(',')
      .map((value) => value.trim())
      .filter((value): value is SourceReaderRole => roleSet.has(value as SourceReaderRole));

    let effective: SourceReaderRole[] = ['reader'];
    if (access.isLocal && options.localAdminEnabled) {
      effective = [...allRoles];
    } else if (trustedRemoteActor && requested?.length) {
      effective = [...new Set(requested)];
    } else if (options.trustRoleHeaders && access.isLocal && requested?.length) {
      const allowed = new Set(effective);
      const selected = requested.filter((role) => allowed.has(role));
      effective = selected.length ? selected : ['reader'];
    }

    request.sourceReaderActor = { ...(id ? { id } : {}), roles: effective };
    next();
  };
}
