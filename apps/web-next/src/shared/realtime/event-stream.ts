import type { ConnectionState } from './connection-status';

export interface EventStreamOptions<T> {
  url: string;
  decoder: (value: unknown) => T;
  onValue: (value: T) => void;
  onStatus?: (status: ConnectionState) => void;
  onError?: (error: unknown) => void;
  createSource?: (url: string) => EventSource;
}

export interface EventStream {
  close(): void;
}

export function createEventStream<T>(options: EventStreamOptions<T>): EventStream {
  const createSource = options.createSource ?? ((url: string) => new EventSource(url));
  options.onStatus?.('connecting');
  const source = createSource(options.url);

  source.onopen = () => options.onStatus?.('connected');
  source.onmessage = (message) => {
    try {
      options.onValue(options.decoder(JSON.parse(message.data) as unknown));
    } catch (error) {
      options.onError?.(error);
    }
  };
  source.onerror = (error) => {
    options.onStatus?.('disconnected');
    options.onError?.(error);
  };

  return {
    close() {
      source.close();
      options.onStatus?.('disconnected');
    }
  };
}
