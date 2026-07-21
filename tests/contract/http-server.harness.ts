import type { AddressInfo } from 'node:net';
import type { HttpContractRuntime } from './http-contract.types.ts';

export async function withContractServer(
  runtime: HttpContractRuntime,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const instance = await runtime.create();
  const server = instance.app.listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    try {
      if (server.listening) {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve()))
        );
      }
    } finally {
      await instance.close();
    }
  }
}
