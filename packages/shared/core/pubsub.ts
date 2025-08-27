/* FILE: packages/shared/core/pubsub.ts */
// A simple publish-subscribe utility for event-driven communication within the application.
interface SubscriberMap {
  [event: string]: Set<(...args: unknown[]) => void>;
}

interface PubSubInterface {
  subscribers: SubscriberMap;
  subscribe: (event: string, callback: (...args: unknown[]) => void) => () => void; 
  publish: (event: string, data?: unknown) => void;
  unsubscribe: (event: string, callback: (...args: unknown[]) => void) => void;
}

// Custom interface for the data we store in import.meta.hot.data
interface PubSubHmrData {
  pubsub?: PubSubInterface;
}

// Interface for the global window object to hold the instance
interface WindowWithPubSub extends Window {
  __PUBSUB_INSTANCE__?: PubSubInterface;
}

let pubsubInstance: PubSubInterface | undefined = undefined;

const hot = (import.meta as { hot?: { data: Record<string, unknown>, dispose: (cb: (data: Record<string, unknown>) => void) => void } }).hot;

if (hot) {
  const hmrData = hot.data as PubSubHmrData | undefined;
  if (hmrData?.pubsub) {
    pubsubInstance = hmrData.pubsub;
  }
}

// Fallback to window global if HMR didn't provide an instance
if (!pubsubInstance && typeof window !== 'undefined') {
  const globalWindow = window as WindowWithPubSub;
  if (globalWindow.__PUBSUB_INSTANCE__) {
    pubsubInstance = globalWindow.__PUBSUB_INSTANCE__;
  }
}

if (!pubsubInstance) {
  pubsubInstance = {
      subscribers: {} as SubscriberMap,

      subscribe(event: string, callback: (...args: unknown[]) => void): () => void { 
          if (typeof callback !== "function") {
              console.error(`[PubSub ERR] Invalid callback provided for event "${event}".`);
              return () => {}; // Return a no-op function for error case
          }
          if (!this.subscribers[event]) {
              this.subscribers[event] = new Set();
          }
          this.subscribers[event].add(callback);
          
          return () => this.unsubscribe(event, callback); 
      },

      publish(event: string, data?: unknown): void {
          if (!this.subscribers[event]) {
              return;
          }
          this.subscribers[event].forEach((callback: (...args: unknown[]) => void) => {
              try {
                  callback(data);
              } catch (error) {
                  console.error(
                      `[PubSub ERR] Error IN subscriber for event "${event}":`, 
                      error
                  );
              }
          });
      },

      unsubscribe(event: string, callback: (...args: unknown[]) => void): void {
          if (!this.subscribers[event]) {
              return;
          }
          this.subscribers[event].delete(callback);
          if (this.subscribers[event].size === 0) {
              delete this.subscribers[event];
          }
      },
  };

  if (typeof window !== 'undefined') {
    const globalWindow = window as WindowWithPubSub;
    globalWindow.__PUBSUB_INSTANCE__ = pubsubInstance;
  }
}

if (hot) {
  hot.dispose((data: Record<string, unknown>) => {
    (data as PubSubHmrData).pubsub = pubsubInstance;
  });
}

export const pubsub = pubsubInstance!;