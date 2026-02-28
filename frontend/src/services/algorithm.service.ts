import api from "./api.service";
import type { Algorithm } from "../types/models";
import type {
  CreateAlgorithmDto,
  UpdateAlgorithmDto,
} from "../types/dto";

/* ==============================
   GET ALL
============================== */
export function getAlgorithms() {
  return api.get<Algorithm[]>("/algorithms");
}

/* ==============================
   GET ONE
============================== */
export function getAlgorithmById(id: string) {
  return api.get<Algorithm>(`/algorithms/${id}`);
}

/* ==============================
   CREATE
============================== */
export function createAlgorithm(payload: CreateAlgorithmDto) {
  return api.post<Algorithm>("/algorithms", payload);
}

/* ==============================
   UPDATE
============================== */
export function updateAlgorithm(
  id: string,
  payload: UpdateAlgorithmDto
) {
  return api.put<Algorithm>(`/algorithms/${id}`, payload);
}

/* ==============================
   REFRESH FROM GITHUB
============================== */
export function refreshAlgorithmFromGithub(id: string) {
  return api.post<Algorithm>(
    `/algorithms/${id}/refresh`,
    {}
  );
}

/* ==============================
   DELETE
============================== */
export function deleteAlgorithm(id: string) {
  return api.del<{ message: string }>(
    `/algorithms/${id}`
  );
}

/* ==============================
   GET PAPER AND BACKTEST RUNS
============================== */
export function getAlgorithmRuns(id: string) {
  return api.get<{
    backtests: any[];
    paperRuns: any[];
  }>(`/algorithms/${id}/runs`);
}