import express, { type Express } from 'express';
import { join } from 'node:path';

export function mountSpa(app: Express, publicDirectory: string): void {
  const indexPath = join(publicDirectory, 'index.html');
  app.use(
    '/assets',
    express.static(join(publicDirectory, 'assets'), {
      fallthrough: true,
      immutable: true,
      maxAge: '1y',
      index: false
    })
  );
  app.use(
    express.static(publicDirectory, {
      fallthrough: true,
      index: false,
      maxAge: 0
    })
  );
  app.get('*', (request, response, next) => {
    if (request.path === '/api' || request.path.startsWith('/api/')) return next();
    response.setHeader('Cache-Control', 'no-cache');
    return response.sendFile(indexPath);
  });
}
