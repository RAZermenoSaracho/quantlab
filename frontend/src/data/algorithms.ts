import type { Algorithm, CreateAlgorithmDto, UpdateAlgorithmDto } from "@quantlab/contracts";
import {
  createAlgorithm,
  deleteAlgorithm,
  getAlgorithmById,
  getAlgorithmRuns,
  getAlgorithms,
  refreshAlgorithmFromGithub,
  updateAlgorithm,
} from "../services/algorithm.service";
import {
  ALGORITHMS,
  algorithmKey,
  algorithmRunsKey,
} from "./keys";
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

export function useAlgorithmRuns(id: string) {
  return useQuery({
    key: algorithmRunsKey(id),
    fetcher: () => getAlgorithmRuns(id),
    enabled: Boolean(id),
  });
}

export function useCreateAlgorithmMutation() {
  return useMutation<CreateAlgorithmDto, Algorithm>({
    mutationFn: createAlgorithm,
    invalidate: [ALGORITHMS],
  });
}

export function useUpdateAlgorithmMutation(id: string) {
  return useMutation<UpdateAlgorithmDto, Algorithm>({
    mutationFn: (payload) => updateAlgorithm(id, payload),
    invalidate: [ALGORITHMS, algorithmKey(id)],
  });
}

export function useRefreshAlgorithmMutation(id: string) {
  return useMutation<void, Algorithm>({
    mutationFn: async () => refreshAlgorithmFromGithub(id),
    invalidate: [ALGORITHMS, algorithmKey(id)],
  });
}

export function useDeleteAlgorithmMutation() {
  return useMutation<string, { message: string }>({
    mutationFn: deleteAlgorithm,
    invalidate: (output, id) => {
      void output;
      return [ALGORITHMS, algorithmKey(id), algorithmRunsKey(id)];
    },
  });
}
