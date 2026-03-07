import { useEffect } from "react";
import type {
  MessageResponse,
  PaperRun,
  PaperRunDetailResponse,
  PaperTrade,
  PortfolioState,
  StartPaperRunRequest,
  StartPaperRunResponse,
  TradeExecution,
} from "@quantlab/contracts";
import {
  deletePaperRun,
  getAllPaperRuns,
  getPaperRunById,
  getPaperRunState as fetchPaperRunState,
  startPaperRun,
  stopPaperRun,
} from "../services/paper.service";
import { connectSocket } from "../services/socket.service";
import { PAPER_RUNS, paperRunKey, paperStateKey } from "./keys";
import { updateFromEvent, updateQuery } from "./queryClient";
import { useMutation } from "./useMutation";
import { useQuery } from "./useQuery";

function toMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function nearlyEqual(left: number, right: number, epsilon = 1e-8): boolean {
  return Math.abs(left - right) <= epsilon;
}

function findTradeIndex(
  trades: readonly PaperTrade[],
  payload: TradeExecution
): number {
  const payloadOpenedMs = toMs(payload.opened_at ?? null);

  if (payloadOpenedMs != null) {
    const byOpenedAt = trades.findIndex((trade) => {
      if (trade.run_id !== payload.run_id) {
        return false;
      }

      const tradeOpenedMs = toMs(trade.opened_at ?? null);
      return tradeOpenedMs != null && tradeOpenedMs === payloadOpenedMs;
    });

    if (byOpenedAt >= 0) {
      return byOpenedAt;
    }
  }

  return trades.findIndex(
    (trade) =>
      trade.run_id === payload.run_id &&
      trade.closed_at == null &&
      trade.side === payload.side &&
      nearlyEqual(Number(trade.entry_price), Number(payload.entry_price)) &&
      nearlyEqual(Number(trade.quantity), Number(payload.quantity))
  );
}

function mergeTrade(existing: PaperTrade, payload: TradeExecution): PaperTrade {
  return {
    ...existing,
    side: payload.side,
    entry_price: payload.entry_price,
    exit_price: payload.exit_price ?? existing.exit_price ?? null,
    quantity: payload.quantity,
    pnl: payload.pnl ?? existing.pnl ?? null,
    pnl_percent: payload.pnl_percent ?? existing.pnl_percent ?? null,
    opened_at: payload.opened_at ?? existing.opened_at ?? null,
    closed_at: payload.closed_at ?? existing.closed_at ?? null,
    forced_close: payload.forced_close ?? existing.forced_close,
    created_at:
      existing.created_at ??
      payload.opened_at ??
      payload.closed_at ??
      null,
  };
}

function makeTrade(payload: TradeExecution): PaperTrade {
  const identity = payload.opened_at ?? payload.closed_at ?? new Date().toISOString();

  return {
    id: `${payload.run_id}:${identity}`,
    run_id: payload.run_id,
    run_type: "PAPER",
    side: payload.side,
    entry_price: payload.entry_price,
    exit_price: payload.exit_price ?? null,
    quantity: payload.quantity,
    pnl: payload.pnl ?? null,
    pnl_percent: payload.pnl_percent ?? null,
    opened_at: payload.opened_at ?? null,
    closed_at: payload.closed_at ?? null,
    created_at: payload.opened_at ?? payload.closed_at ?? null,
    forced_close: payload.forced_close,
  };
}

export function usePaperRuns() {
  const query = useQuery({
    key: PAPER_RUNS,
    fetcher: async () => (await getAllPaperRuns()).runs,
  });

  useEffect(() => {
    connectSocket();
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    const runs: PaperRun[] = query.data ?? [];
    if (runs.length === 0) {
      return;
    }

    for (const run of runs) {
      socket.emit("join_paper_run", run.id);
    }

    return () => {
      for (const run of runs) {
        socket.emit("leave_paper_run", run.id);
      }
    };
  }, [query.data]);

  return query;
}

export function usePaperRun(id: string) {
  useEffect(() => {
    if (!id) {
      return;
    }

    connectSocket();
  }, [id]);

  useEffect(() => {
    if (!id) {
      return;
    }

    return updateFromEvent("trade_execution", (payload) => {
      if (payload.run_id !== id) {
        return;
      }

      updateQuery<PaperRunDetailResponse>(paperRunKey(id), (current) => {
        if (!current?.data) {
          return current;
        }

        const existingIndex = findTradeIndex(current.data.trades, payload);

        if (existingIndex >= 0) {
          const nextTrades = [...current.data.trades];
          nextTrades[existingIndex] = mergeTrade(nextTrades[existingIndex], payload);

          return {
            ...current,
            data: {
              ...current.data,
              trades: nextTrades,
            },
          };
        }

        const nextTrade = makeTrade(payload);

        return {
          ...current,
          data: {
            ...current.data,
            trades: [nextTrade, ...current.data.trades],
          },
        };
      });
    });
  }, [id]);

  return useQuery({
    key: paperRunKey(id),
    fetcher: () => getPaperRunById(id),
    enabled: Boolean(id),
  });
}

export function usePaperState(id: string) {
  useEffect(() => {
    if (!id) {
      return;
    }

    connectSocket();
  }, [id]);

  useEffect(() => {
    if (!id) {
      return;
    }

    return updateFromEvent("portfolio_update", (payload) => {
      if (payload.run_id !== id) {
        return;
      }

      updateQuery<PortfolioState>(paperStateKey(id), (current) => {
        const previous = current ?? {
          data: null,
          loading: false,
          error: null,
        };

        return {
          ...previous,
          data: payload,
          loading: false,
          error: null,
        };
      });
    });
  }, [id]);

  return useQuery({
    key: paperStateKey(id),
    fetcher: () => fetchPaperRunState(id),
    enabled: Boolean(id),
  });
}

export function useStartPaperRunMutation() {
  return useMutation<StartPaperRunRequest, StartPaperRunResponse>({
    mutationFn: startPaperRun,
    invalidate: [PAPER_RUNS],
  });
}

export function useStopPaperRunMutation() {
  return useMutation<string, MessageResponse>({
    mutationFn: stopPaperRun,
    invalidate: (output, id) => {
      void output;
      return [PAPER_RUNS, paperRunKey(id)];
    },
  });
}

export function useDeletePaperRunMutation() {
  return useMutation<string, MessageResponse>({
    mutationFn: deletePaperRun,
    invalidate: (output, id) => {
      void output;
      return [PAPER_RUNS, paperRunKey(id)];
    },
  });
}
