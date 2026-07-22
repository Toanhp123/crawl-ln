import type { SourceReaderActor, SourceReaderRole } from '../ports/source-reader-actor.port.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

const impliedRoles: Record<SourceReaderRole, SourceReaderRole[]> = {
  reader: ['reader'],
  'source-manager': ['reader', 'source-manager'],
  'source-admin': ['reader', 'source-manager', 'source-admin'],
  'system-admin': ['reader', 'source-manager', 'source-admin', 'system-admin']
};

export class SourceReaderAuthorizationPolicy {
  requireRole(actor: SourceReaderActor, required: SourceReaderRole): void {
    const effective = new Set(actor.roles.flatMap((role) => impliedRoles[role] ?? []));
    if (!effective.has(required)) this.denied(`Role ${required} is required`);
  }

  assertCredentialAccess(
    actor: SourceReaderActor,
    resource: { ownerType: 'system' | 'user'; ownerId?: string }
  ): void {
    if (resource.ownerType === 'system') {
      this.requireRole(actor, 'system-admin');
      return;
    }
    this.requireRole(actor, 'source-manager');
    if (!actor.id || actor.id !== resource.ownerId) {
      this.denied('Credential belongs to another user');
    }
  }

  assertNetworkAccess(
    actor: SourceReaderActor,
    resource: { ownerType: 'system' | 'user'; ownerId?: string }
  ): void {
    this.assertCredentialAccess(actor, resource);
  }

  private denied(message: string): never {
    throw new SourceReaderError('PLUGIN_PERMISSION_DENIED', message, {
      retryable: false,
      fallbackAllowed: false
    });
  }
}
