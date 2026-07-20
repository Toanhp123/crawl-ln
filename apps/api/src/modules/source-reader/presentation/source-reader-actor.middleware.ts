import type { NextFunction, Request, Response } from 'express';
import type {
  SourceReaderActor,
  SourceReaderRole
} from '../application/ports/source-reader-actor.port.js';

const roles = new Set<SourceReaderRole>([
  'reader',
  'source-manager',
  'source-admin',
  'system-admin'
]);

export interface SourceReaderRequest extends Request {
  sourceReaderActor?: SourceReaderActor;
  sourceReaderRequestId?: string;
}

export function sourceReaderActorMiddleware(options: {
  defaultRoles: SourceReaderRole[];
  trustRoleHeaders: boolean;
}) {
  return (request: SourceReaderRequest, _response: Response, next: NextFunction): void => {
    const id = request.header('x-source-reader-user-id') || undefined;
    const requested = options.trustRoleHeaders
      ? request
          .header('x-source-reader-roles')
          ?.split(',')
          .map((value) => value.trim())
          .filter((value): value is SourceReaderRole => roles.has(value as SourceReaderRole))
      : undefined;
    request.sourceReaderActor = {
      ...(id ? { id } : {}),
      roles: requested?.length ? requested : [...options.defaultRoles]
    };
    next();
  };
}
