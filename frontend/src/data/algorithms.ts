import { useEffect } from "react";
import type {
  Algorithm,
  AlgorithmSummary,
  CreateAlgorithmDto,
  UpdateAlgorithmDto,
} from "@quantlab/contracts";
import type {
  AlgorithmPaperRun,
  AlgorithmRunsResponse,
  PaperRunStatusEvent,
  PaperRunUpdateEvent,
  PaperTick,
  PortfolioUpdateEvent,
  TradeExecution,
} from "@quantlab/contracts";
import {
  createAlgorithm,
  deleteAlgorithm,
  getAlgorithmById,
  getAlgorithmRanking,
  getAlgorithmRuns,
  getAlgorithms,
  refreshAlgorithmFromGithub,
  updateAlgorithm,
} from "../services/algorithm.service";
import { connectSocket } from "../services/socket.service";
import {
  ALGORITHMS,
  ALGORITHM_RANKING,
  algorithmKey,
  algorithmRunsKey,
} from "./keys";
import { updateFromEvent, updateQuery } from "./queryClient";
import { useMutation } from "./useMutation";
import { useQuery } from "./useQuery";

export function useAlgorithms() {
  return useQuery({
    key: ALGORITHMS,
    fetcher: async () => (await getAlgorithms()).algorithms,
  });
}

export function useAlgorithm(id: string) {
  return useQuery({
    key: algorithmKey(id),
    fetcher: () => getAlgorithmById(id),
    enabled: Boolean(id),
  });
}

export function useAlgorithmRanking() {
  return useQuery({
    key: ALGORITHM_RANKING,
    fetcher: async () => (await getAlgorithmRanking()).algorithms as AlgorithmSummary[],
  });
}

export function useAlgorithmRuns(id: string) {
  const query = useQuery({
    key: algorithmRunsKey(id),
    fetcher: () => getAlgorithmRuns(id),
    enabled: Boolean(id),
  });

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

    const socket = connectSocket();
    const runs = query.data?.paperRuns ?? [];
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
  }, [id, query.data]);

  useEffect(() => {
    if (!id) {
      return;
    }

    const runsKey = algorithmRunsKey(id);
    const updatePaperRuns = (
      runId: string,
      updater: (run: AlgorithmPaperRun) => AlgorithmPaperRun
    ) => {
      updateQuery<AlgorithmRunsResponse>(runsKey, (current) => {
        if (!current?.data) {
          return current;
        }

        return {
          ...current,
          data: {
            ...current.data,
            paperRuns: current.data.paperRuns.map((run) =>
              run.id === runId ? updater(run) : run
            ),
          },
        };
      });
    };

    const unsubs = [
      updateFromEvent("paper_run_update", (payload: PaperRunUpdateEvent) => {
        updatePaperRuns(payload.run_id, (run) => ({
          ...run,
          quote_balance: payload.quote_balance ?? run.quote_balance,
          base_balance: payload.base_balance ?? run.base_balance,
          equity: payload.equity ?? run.equity,
          last_price: payload.last_price ?? run.last_price,
        }));
      }),
      updateFromEvent("portfolio_update", (payload: PortfolioUpdateEvent) => {
        updatePaperRuns(payload.run_id, (run) => ({
          ...run,
          current_balance: payload.usdt_balance,
          quote_balance: payload.usdt_balance,
          base_balance: payload.btc_balance,
          equity: payload.equity,
        }));
      }),
      updateFromEvent("paper_tick", (payload: PaperTick) => {
        updatePaperRuns(payload.run_id, (run) => ({
          ...run,
          last_price: payload.close,
        }));
      }),
      updateFromEvent("trade_execution", (payload: TradeExecution) => {
        updatePaperRuns(payload.run_id, (run) => ({
          ...run,
          last_price: payload.exit_price ?? payload.entry_price ?? run.last_price,
        }));
      }),
      updateFromEvent("paper_run_status", (payload: PaperRunStatusEvent) => {
        updatePaperRuns(payload.run_id, (run) => ({
          ...run,
          status: payload.status,
        }));
      }),
      updateFromEvent("paper_run_error", (payload) => {
        updatePaperRuns(payload.run_id, (run) => ({
          ...run,
          status: "STOPPED",
        }));
      }),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [id]);

  return query;
}

export function useCreateAlgorithmMutation() {
  return useMutation<CreateAlgorithmDto, Algorithm>({
    mutationFn: createAlgorithm,
    invalidate: [ALGORITHMS, ALGORITHM_RANKING],
  });
}

export function useUpdateAlgorithmMutation(id: string) {
  return useMutation<UpdateAlgorithmDto, Algorithm>({
    mutationFn: (payload) => updateAlgorithm(id, payload),
    invalidate: [ALGORITHMS, ALGORITHM_RANKING, algorithmKey(id)],
  });
}

export function useRefreshAlgorithmMutation(id: string) {
  return useMutation<void, Algorithm>({
    mutationFn: async () => refreshAlgorithmFromGithub(id),
    invalidate: [ALGORITHMS, ALGORITHM_RANKING, algorithmKey(id)],
  });
}

export function useDeleteAlgorithmMutation() {
  return useMutation<string, { message: string }>({
    mutationFn: deleteAlgorithm,
    invalidate: (output, id) => {
        void output;
      return [ALGORITHMS, ALGORITHM_RANKING, algorithmKey(id), algorithmRunsKey(id)];
    },
  });
}
