import { subscribe } from "../events/eventBus";
import type { ServerToClientEvents } from "@quantlab/contracts";

export type QueryKey = string;

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

type QueryListener = () => void;
type QueryUpdater<T> = (
  current: QueryState<T> | undefined
) => QueryState<T> | undefined;

const queries = new Map<QueryKey, QueryState<unknown>>();
const listeners = new Map<QueryKey, Set<QueryListener>>();

export function getQuery<T>(key: QueryKey): QueryState<T> | undefined {
  return queries.get(key) as QueryState<T> | undefined;
}

export function setQuery<T>(key: QueryKey, state: QueryState<T>) {
  queries.set(key, state as QueryState<unknown>);
  listeners.get(key)?.forEach((listener) => listener());
}

export function updateQuery<T>(key: QueryKey, updater: QueryUpdater<T>) {
  const nextState = updater(getQuery<T>(key));

  if (!nextState) {
    queries.delete(key);
    listeners.get(key)?.forEach((listener) => listener());
    return;
  }

  setQuery(key, nextState);
}

export function invalidateQuery(key: QueryKey) {
  queries.delete(key);
  listeners.get(key)?.forEach((listener) => listener());
}

export function updateFromEvent<K extends keyof ServerToClientEvents>(
  eventName: K,
  handler: (payload: Parameters<ServerToClientEvents[K]>[0]) => void
) {
  return subscribe(eventName, handler);
}

export function subscribeQuery(key: QueryKey, listener: QueryListener) {
  const keyListeners = listeners.get(key) ?? new Set<QueryListener>();
  keyListeners.add(listener);
  listeners.set(key, keyListeners);

  return () => {
    const current = listeners.get(key);
    if (!current) {
      return;
    }

    current.delete(listener);
    if (current.size === 0) {
      listeners.delete(key);
    }
  };
}
