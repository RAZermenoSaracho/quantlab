import { useEffect } from "react";
import type { CreateBacktestRequest, CreateBacktestResponse } from "@quantlab/contracts";
import {
  createBacktest,
  deleteBacktest,
  getAllBacktests,
  getBacktest,
  getBacktestStatus,
} from "../services/backtest.service";
import { connectSocket } from "../services/socket.service";
import {
  BACKTESTS,
  backtestKey,
  backtestStatusKey,
} from "./keys";
import { useMutation } from "./useMutation";
import { useQuery } from "./useQuery";

export function useBacktests() {
  useEffect(() => {
    connectSocket();
  }, []);

  return useQuery({
    key: BACKTESTS,
    fetcher: async () => (await getAllBacktests()).backtests,
  });
}

export function useBacktest(id: string) {
  return useQuery({
    key: backtestKey(id),
    fetcher: () => getBacktest(id),
    enabled: Boolean(id),
  });
}

export function useBacktestStatus(id: string) {
  useEffect(() => {
    if (!id) {
      return;
    }

    connectSocket();
  }, [id]);

  const query = useQuery({
    key: backtestStatusKey(id),
    fetcher: () => getBacktestStatus(id),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!id) {
      return;
    }

    const status = query.data?.status;
    if (!status || status === "COMPLETED" || status === "FAILED") {
      return;
    }

    const interval = window.setInterval(() => {
      void query.refetch();
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [id, query.data?.status, query.refetch]);

  return query;
}

export function useCreateBacktestMutation() {
  return useMutation<CreateBacktestRequest, CreateBacktestResponse>({
    mutationFn: createBacktest,
    invalidate: [BACKTESTS],
  });
}

export function useDeleteBacktestMutation() {
  return useMutation<string, { message: string }>({
    mutationFn: deleteBacktest,
    invalidate: (output, id) => {
      void output;
      return [BACKTESTS, backtestKey(id), backtestStatusKey(id)];
    },
  });
}
