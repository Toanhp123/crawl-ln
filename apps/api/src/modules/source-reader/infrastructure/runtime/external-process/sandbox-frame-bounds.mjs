export const MAX_SANDBOX_PROTOCOL_DEPTH = 32;
export const MAX_SANDBOX_PROTOCOL_NODES = 10_000;
export const MAX_SANDBOX_PROTOCOL_BYTES = 512_000;

function stringBytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

export function isSandboxFrameWithinBounds(root) {
  const stack = [{ value: root, depth: 0 }];
  const seen = new WeakSet();
  let nodes = 0;
  let bytes = 0;

  try {
    while (stack.length > 0) {
      const current = stack.pop();
      nodes += 1;
      if (
        nodes > MAX_SANDBOX_PROTOCOL_NODES ||
        current.depth > MAX_SANDBOX_PROTOCOL_DEPTH
      ) {
        return false;
      }

      const value = current.value;
      if (value === null) {
        bytes += 4;
      } else if (typeof value === 'string') {
        bytes += stringBytes(value) + 2;
      } else if (typeof value === 'number') {
        if (!Number.isFinite(value)) return false;
        bytes += 24;
      } else if (typeof value === 'boolean') {
        bytes += 5;
      } else if (typeof value === 'undefined') {
        bytes += 0;
      } else if (typeof value === 'object') {
        if (seen.has(value)) return false;
        seen.add(value);

        if (Array.isArray(value)) {
          bytes += value.length + 2;
          for (let index = value.length - 1; index >= 0; index -= 1) {
            stack.push({ value: value[index], depth: current.depth + 1 });
          }
        } else {
          const keys = Object.keys(value);
          if (Reflect.ownKeys(value).length !== keys.length) return false;
          bytes += keys.length + 2;
          const descriptors = Object.getOwnPropertyDescriptors(value);
          for (let index = keys.length - 1; index >= 0; index -= 1) {
            const key = keys[index];
            const descriptor = descriptors[key];
            if (!descriptor || !('value' in descriptor)) return false;
            bytes += stringBytes(key) + 3;
            stack.push({ value: descriptor.value, depth: current.depth + 1 });
          }
        }
      } else {
        return false;
      }

      if (bytes > MAX_SANDBOX_PROTOCOL_BYTES) return false;
    }
  } catch {
    return false;
  }

  return true;
}
