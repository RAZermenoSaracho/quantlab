import { useEffect } from "react";
import type {
  MessageResponse,
  StartPaperRunRequest,
  StartPaperRunResponse,
} from "@quantlab/contracts";
import {
  deletePaperRun,
  getAllPaperRuns,
  getPaperRunById,
  startPaperRun,
  stopPaperRun,
} from "../services/paper.service";
import { connectSocket } from "../services/socket.service";
import { PAPER_RUNS, paperRunKey } from "./keys";
import { useMutation } from "./useMutation";
import { useQuery } from "./useQuery";

export function usePaperRuns() {
  useEffect(() => {
    connectSocket();
  }, []);

  return useQuery({
    key: PAPER_RUNS,
    fetcher: async () => (await getAllPaperRuns()).runs,
  });
}

export function usePaperRun(id: string) {
  useEffect(() => {
    if (!id) {
      return;
    }

    connectSocket();
  }, [id]);

  return useQuery({
    key: paperRunKey(id),
    fetcher: () => getPaperRunById(id),
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
