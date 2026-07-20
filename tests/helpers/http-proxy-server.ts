import { createServer, request as httpRequest, type Server } from 'node:http';
import { connect } from 'node:net';

export interface TestHttpProxy {
  server: Server;
  url: string;
  requests: Array<{ method: string; url: string }>;
  close(): Promise<void>;
}

export async function startHttpProxyServer(): Promise<TestHttpProxy> {
  const requests: Array<{ method: string; url: string }> = [];
  const server = createServer((request, response) => {
    const target = new URL(request.url ?? '');
    requests.push({ method: request.method ?? 'GET', url: target.toString() });
    const upstream = httpRequest(
      target,
      {
        method: request.method,
        headers: { ...request.headers, 'x-test-proxy': 'http' }
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      }
    );
    upstream.on('error', (error) => response.destroy(error));
    request.pipe(upstream);
  });
  server.on('connect', (request, clientSocket, head) => {
    const [host, rawPort] = (request.url ?? '').split(':');
    const upstream = connect(Number(rawPort), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('proxy did not bind');
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
  };
}
