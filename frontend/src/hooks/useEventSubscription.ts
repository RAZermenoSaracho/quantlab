import { useEffect, useRef } from "react";
import type { ServerToClientEvents } from "@quantlab/contracts";
import { subscribe } from "../events/eventBus";

export function useEventSubscription<K extends keyof ServerToClientEvents>(
  eventName: K,
  handler: (payload: Parameters<ServerToClientEvents[K]>[0]) => void,
  enabled = true
) {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return subscribe(eventName, (payload) => {
      handlerRef.current(payload);
    });
  }, [enabled, eventName]);
}
