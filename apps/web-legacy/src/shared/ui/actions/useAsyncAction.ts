import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionState } from './actionFeedback';

export function useAsyncAction() {
  const [state, setState] = useState<ActionState>('idle');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async <T>(operation: () => Promise<T>): Promise<T> => {
    if (mountedRef.current) setState('pending');
    try {
      const result = await operation();
      if (mountedRef.current) setState('success');
      return result;
    } catch (error) {
      if (mountedRef.current) setState('error');
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    if (mountedRef.current) setState('idle');
  }, []);

  return { state, run, reset };
}
