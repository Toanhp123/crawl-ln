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
  let disposed = false;

  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (disposed || pending.length === 0) return;
    const values = pending.splice(0, pending.length);
    await consume(values);
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
