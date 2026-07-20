import { createServer, connect, type Server, type Socket } from 'node:net';

export interface TestSocks5Proxy {
  server: Server;
  url: string;
  destinations: string[];
  close(): Promise<void>;
}

function readAddress(buffer: Buffer, offset: number): { host: string; next: number } {
  const type = buffer[offset];
  if (type === 1) {
    return {
      host: `${buffer[offset + 1]}.${buffer[offset + 2]}.${buffer[offset + 3]}.${buffer[offset + 4]}`,
      next: offset + 5
    };
  }
  if (type === 3) {
    const length = buffer[offset + 1];
    return {
      host: buffer.subarray(offset + 2, offset + 2 + length).toString('utf8'),
      next: offset + 2 + length
    };
  }
  throw new Error('Unsupported SOCKS address type');
}

export async function startSocks5ProxyServer(): Promise<TestSocks5Proxy> {
  const destinations: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    let stage: 'greeting' | 'request' | 'proxy' = 'greeting';
    socket.on('data', (buffer) => {
      if (stage === 'greeting') {
        socket.write(Buffer.from([5, 0]));
        stage = 'request';
        return;
      }
      if (stage !== 'request') return;
      const { host, next } = readAddress(buffer, 3);
      const port = buffer.readUInt16BE(next);
      destinations.push(`${host}:${port}`);
      stage = 'proxy';
      const upstream = connect(port, host, () => {
        socket.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
        const remaining = buffer.subarray(next + 2);
        if (remaining.length > 0) upstream.write(remaining);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      upstream.on('error', () => socket.destroy());
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('SOCKS proxy did not bind');
  return {
    server,
    url: `socks5://127.0.0.1:${address.port}`,
    destinations,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  };
}
