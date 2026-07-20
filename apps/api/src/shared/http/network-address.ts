import { isIP } from 'node:net';

export function isLoopbackAddress(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'localhost' || normalized === '::1') return true;
  if (normalized.startsWith('::ffff:')) {
    return isLoopbackAddress(normalized.slice('::ffff:'.length));
  }
  if (isIP(normalized) === 4) {
    const firstOctet = Number(normalized.split('.', 1)[0]);
    return firstOctet === 127;
  }
  return false;
}
