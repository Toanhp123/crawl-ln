export interface BatchQueue<T> {
  enqueue(value: T): void;
  flush(): Promise<void>;
  dispose(): void;
}

export interface BatchQueueOptions {
  windowMs?: number;
}

export function createBatchQueue<T>(
  consume: (values: readonly T[]) => void | Promise<void>,
  options: BatchQueueOptions = {}
): BatchQueue<T> {
  const pending: T[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let disposed = false;

  const flush = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (disposed || pending.length === 0) return active ?? Promise.resolve();
    const values = pending.splice(0, pending.length);
    const previous = active?.catch(() => undefined) ?? Promise.resolve();
    const current = previous.then(async () => {
      if (disposed) return;
      await consume(values);
    });
    active = current;
    current.then(
      () => {
        if (active === current) active = undefined;
      },
      () => {
        if (active === current) active = undefined;
      }
    );
    return current;
  };

  const enqueue = (value: T) => {
    if (disposed) return;
    pending.push(value);
    if (!timer) timer = setTimeout(() => void flush(), options.windowMs ?? 150);
  };

  const dispose = () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    timer = undefined;
    pending.length = 0;
  };

  return { enqueue, flush, dispose };
}
