import { randomBytes, randomUUID } from 'node:crypto';
import type { IdGeneratorPort } from '../ports/id-generator.port.js';

export class CryptoIdGenerator implements IdGeneratorPort {
  randomId() {
    return typeof randomUUID === 'function' ? randomUUID() : randomBytes(16).toString('hex');
  }
}
