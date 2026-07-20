export async function invokeCapability(payload, context) {
  if (payload.mode === 'hang') await new Promise(() => {});
  return {
    data: {
      sum: Number(payload.left ?? 0) + Number(payload.right ?? 0),
      clock: await context.host.clockNow()
    }
  };
}
