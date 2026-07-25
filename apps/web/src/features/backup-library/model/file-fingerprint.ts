const PARTIAL_RANGE_BYTES = 1024 * 1024;
const FINGERPRINT_PREFIX = new TextEncoder().encode('sha256-partial-v1\0');

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function computeRestoreFileFingerprint(
  file: File
): Promise<`sha256-partial-v1:${string}`> {
  const firstLength = Math.min(PARTIAL_RANGE_BYTES, file.size);
  const lastLength = Math.min(PARTIAL_RANGE_BYTES, file.size);
  const [first, last] = await Promise.all([
    file.slice(0, firstLength).arrayBuffer(),
    file.slice(file.size - lastLength, file.size).arrayBuffer()
  ]);
  const size = new ArrayBuffer(8);
  new DataView(size).setBigUint64(0, BigInt(file.size), false);
  const input = new Uint8Array(
    FINGERPRINT_PREFIX.byteLength + size.byteLength + first.byteLength + last.byteLength
  );
  let offset = 0;
  input.set(FINGERPRINT_PREFIX, offset);
  offset += FINGERPRINT_PREFIX.byteLength;
  input.set(new Uint8Array(size), offset);
  offset += size.byteLength;
  input.set(new Uint8Array(first), offset);
  offset += first.byteLength;
  input.set(new Uint8Array(last), offset);
  const digest = await crypto.subtle.digest('SHA-256', input);
  return `sha256-partial-v1:${toHex(digest)}`;
}
