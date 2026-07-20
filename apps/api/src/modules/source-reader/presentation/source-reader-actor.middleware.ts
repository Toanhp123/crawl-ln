import type { NextFunction, Request, Response } from 'express';
import type { ApiAccessRequest } from '../../../shared/http/api-access.middleware.js';
import type {
  SourceReaderActor,
  SourceReaderRole
} from '../application/ports/source-reader-actor.port.js';

const allRoles: SourceReaderRole[] = [
  'reader',
  'source-manager',
  'source-admin',
  'system-admin'
];
const roleSet = new Set<SourceReaderRole>(allRoles);

export interface SourceReaderRequest extends Request, ApiAccessRequest {
  sourceReaderActor?: SourceReaderActor;
  sourceReaderRequestId?: string;
}

export function sourceReaderActorMiddleware(options: {
  localAdminEnabled: boolean;
  trustRoleHeaders: boolean;
}) {
  return (request: SourceReaderRequest, _response: Response, next: NextFunction): void => {
    const access = request.apiAccess ?? { isLocal: false, authenticated: false };
    const id = request.header('x-source-reader-user-id') || undefined;
    const requested = request
      .header('x-source-reader-roles')
      ?.split(',')
      .map((value) => value.trim())
      .filter((value): value is SourceReaderRole => roleSet.has(value as SourceReaderRole));

    let effective: SourceReaderRole[] = ['reader'];
    if (access.isLocal && options.localAdminEnabled) {
      effective = [...allRoles];
    } else if (
      options.trustRoleHeaders &&
      access.authenticated &&
      !access.isLocal &&
      requested?.length
    ) {
      effective = [...new Set(requested)];
    } else if (
      options.trustRoleHeaders &&
      access.isLocal &&
      requested?.length
    ) {
      const allowed = new Set(effective);
      const selected = requested.filter((role) => allowed.has(role));
      effective = selected.length ? selected : ['reader'];
    }

    request.sourceReaderActor = {
      ...(id ? { id } : {}),
      roles: effective
    };
    next();
  };
}
