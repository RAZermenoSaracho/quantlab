import { useCallback, useEffect, useRef, useState } from "react";
import type { AsyncState } from "../types/ui";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useApi<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[] = [],
  options?: {
    enabled?: boolean;
    initialData?: T | null;
    fallbackMessage?: string;
  }
) {
  const {
    enabled = true,
    initialData = null,
    fallbackMessage = "Request failed",
  } = options ?? {};
  const loaderRef = useRef(loader);

  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    loading: enabled,
    error: null,
  });

  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const execute = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));

    try {
      const data = await loaderRef.current();
      setState({
        data,
        loading: false,
        error: null,
      });
    } catch (error: unknown) {
      setState((prev) => ({
        data: prev.data,
        loading: false,
        error: getErrorMessage(error, fallbackMessage),
      }));
    }
  }, [enabled, fallbackMessage]);

  useEffect(() => {
    void execute();
  }, [execute, ...deps]);

  const setData = useCallback((value: T | ((current: T | null) => T | null)) => {
    setState((prev) => ({
      ...prev,
      data: typeof value === "function"
        ? (value as (current: T | null) => T | null)(prev.data)
        : value,
    }));
  }, []);

  return {
    ...state,
    reload: execute,
    setData,
  };
}
