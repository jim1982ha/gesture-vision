/* FILE: packages/frontend/src/hooks/usePubSub.ts */
import { useEffect, useState } from 'react';
import { pubsub } from '#shared/index.js';

/**
 * A React hook to subscribe to a pubsub event.
 * FIX: This version uses a simple counter to force a re-render even
 * when the event payload is undefined, making it suitable for simple notification events.
 * @param eventName The event to subscribe to.
 * @returns The latest data published for that event.
 */
export function usePubSub<T>(eventName: string): T | undefined {
  const [data, setData] = useState<T | undefined>(undefined);
  const [, setTick] = useState(0);

  useEffect(() => {
    const handleEvent = (eventData: unknown) => {
      setData(eventData as T);
      setTick(t => t + 1);
    };
    const unsubscribe = pubsub.subscribe(eventName, handleEvent);
    return () => unsubscribe();
  }, [eventName]);

  return data;
}