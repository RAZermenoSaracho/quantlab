import type { ServerToClientEvents } from "@quantlab/contracts";

type EventMap = ServerToClientEvents;
type EventName = keyof EventMap;
type EventPayload<K extends EventName> = Parameters<EventMap[K]>[0];
type InternalHandler = (payload: unknown) => void;
type EventHandler<K extends EventName> = (payload: EventPayload<K>) => void;

const handlers = new Map<string, Set<InternalHandler>>();

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
  if (!eventHandlers) {
    return;
  }

  eventHandlers.forEach((handler) => {
    handler(payload);
  });
}
