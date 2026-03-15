import api from "./api.service";
import type {
  OptimizerRanking,
  OptimizerRequest,
} from "@quantlab/contracts";

export function runOptimizer(payload: OptimizerRequest): Promise<OptimizerRanking> {
  return api.post<OptimizerRanking>("/optimizer/run", payload);
}
