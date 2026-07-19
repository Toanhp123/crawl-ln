export default (context) => ({
  async readMetadata(request) {
    if (request.mode === 'hang') await new Promise(() => {});
    if (request.mode === 'crash') throw new Error('worker-demo-crash');
    const resolved = await context.url.resolve('/resolved', request.url);
    await context.logger.info('worker-demo', { resolved });
    return {
      data: { title: 'Worker Demo', sourceUrl: resolved },
      extensions: {
        'demo/env': { version: 1, data: { leaked: Boolean(process.env.WORKER_SECRET_SENTINEL) } }
      }
    };
  }
});
