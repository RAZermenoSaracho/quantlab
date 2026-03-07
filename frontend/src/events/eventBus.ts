import type { ServerToClientEvents } from "@quantlab/contracts";

type EventMap = ServerToClientEvents;
type EventName = keyof EventMap;
type EventPayload<K extends EventName> = Parameters<EventMap[K]>[0];
type InternalHandler = (payload: unknown) => void;
type EventHandler<K extends EventName> = (payload: EventPayload<K>) => void;
type PendingPayloads = Map<EventName, unknown[]>;

const handlers = new Map<string, Set<InternalHandler>>();
const pendingPayloads: PendingPayloads = new Map();

const EVENT_FLUSH_MS = 100;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function ensureFlushTimer() {
  if (flushTimer) {
    return;
  }

  flushTimer = setInterval(() => {
    if (pendingPayloads.size === 0) {
      return;
    }

    const snapshot = new Map(pendingPayloads);
    pendingPayloads.clear();

    snapshot.forEach((payloads, eventName) => {
      const eventHandlers = handlers.get(eventName);
      if (!eventHandlers || eventHandlers.size === 0) {
        return;
      }

      const currentHandlers = [...eventHandlers];
      for (const payload of payloads) {
        for (const handler of currentHandlers) {
          handler(payload);
        }
      }
    });
  }, EVENT_FLUSH_MS);
}

export function subscribe<K extends EventName>(
  eventName: K,
  handler: EventHandler<K>
) {
  const eventHandlers = handlers.get(eventName) ?? new Set<InternalHandler>();
  eventHandlers.add(handler as InternalHandler);
  handlers.set(eventName, eventHandlers);

  return () => {
    unsubscribe(eventName, handler);
  };
}

export function unsubscribe<K extends EventName>(
  eventName: K,
  handler: EventHandler<K>
) {
  const eventHandlers = handlers.get(eventName);
  if (!eventHandlers) {
    return;
  }

  eventHandlers.delete(handler as InternalHandler);

  if (eventHandlers.size === 0) {
    handlers.delete(eventName);
  }
}

export function emit<K extends EventName>(
  eventName: K,
  payload: EventPayload<K>
) {
  const eventHandlers = handlers.get(eventName);
  if (!eventHandlers || eventHandlers.size === 0) {
    return;
  }

  ensureFlushTimer();
  const queue = pendingPayloads.get(eventName) ?? [];
  queue.push(payload);
  pendingPayloads.set(eventName, queue);
}
