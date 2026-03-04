import { useCallback, useEffect, useRef, useState } from "react";
import {
  getQuery,
  setQuery,
  subscribeQuery,
  type QueryKey,
  type QueryState,
} from "./queryClient";

type UseQueryOptions<T> = {
  key: QueryKey;
  fetcher: () => Promise<T>;
  enabled?: boolean;
};

const inFlight = new Map<QueryKey, Promise<void>>();

function createDefaultState<T>(): QueryState<T> {
  return {
    data: null,
    loading: true,
    error: null,
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed";
}

export function useQuery<T>({ key, fetcher, enabled = true }: UseQueryOptions<T>) {
  const fetcherRef = useRef(fetcher);
  const [state, setState] = useState<QueryState<T>>(
    () =>
      getQuery<T>(key) ??
      (enabled
        ? createDefaultState<T>()
        : {
            data: null,
            loading: false,
            error: null,
          })
  );

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const execute = useCallback(async () => {
    const pending = inFlight.get(key);
    if (pending) {
      await pending;
      return;
    }

    if (!enabled) {
      setState({
        data: null,
        loading: false,
        error: null,
      });
      return;
    }

    const current = getQuery<T>(key);
    setQuery<T>(key, {
      data: current?.data ?? null,
      loading: true,
      error: null,
    });

    const request = (async () => {
      try {
        const data = await fetcherRef.current();
        setQuery<T>(key, {
          data,
          loading: false,
          error: null,
        });
      } catch (error: unknown) {
        setQuery<T>(key, {
          data: getQuery<T>(key)?.data ?? null,
          loading: false,
          error: getErrorMessage(error),
        });
      } finally {
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, request);
    await request;
  }, [enabled, key]);

  useEffect(() => {
    const unsubscribe = subscribeQuery(key, () => {
      const nextState = getQuery<T>(key);
      if (!nextState) {
        void execute();
        return;
      }

      setState(nextState);
    });

    const cached = getQuery<T>(key);
    if (cached) {
      setState(cached);
    } else if (enabled) {
      void execute();
    } else {
      setState({
        data: null,
        loading: false,
        error: null,
      });
    }

    return unsubscribe;
  }, [enabled, execute, key]);

  return {
    ...state,
    refetch: execute,
  };
}
