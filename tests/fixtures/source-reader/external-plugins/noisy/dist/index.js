console.log('stdout-secret-token');
console.error('stderr-secret-password');

export async function invokeCapability() {
  console.log('stdout-secret-token');
  console.error('stderr-secret-password');
  return { data: { ok: true } };
}
