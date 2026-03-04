import { useEffect, useRef } from "react";

export function usePolling(
  callback: () => Promise<void> | void,
  intervalMs: number,
  enabled = true
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = window.setInterval(() => {
      void callbackRef.current();
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [enabled, intervalMs]);
}
