import api from "./api.service";

import type {
  Algorithm,
  AlgorithmsListResponse,
  CreateAlgorithmDto,
  UpdateAlgorithmDto,
} from "@quantlab/contracts";

/* ==============================
   GET ALL
============================== */

export function getAlgorithms(): Promise<AlgorithmsListResponse> {
  return api.get<AlgorithmsListResponse>("/algorithms");
}

/* ==============================
   GET ONE
============================== */

export function getAlgorithmById(id: string): Promise<Algorithm> {
  return api.get<Algorithm>(`/algorithms/${id}`);
}

/* ==============================
   CREATE
============================== */

export function createAlgorithm(payload: CreateAlgorithmDto): Promise<Algorithm> {
  return api.post<Algorithm>("/algorithms", payload);
}

/* ==============================
   UPDATE
============================== */

export function updateAlgorithm(
  id: string,
  payload: UpdateAlgorithmDto
): Promise<Algorithm> {
  return api.put<Algorithm>(`/algorithms/${id}`, payload);
}

/* ==============================
   REFRESH FROM GITHUB
============================== */

export function refreshAlgorithmFromGithub(id: string): Promise<Algorithm> {
  return api.post<Algorithm>(`/algorithms/${id}/refresh`, {});
}

/* ==============================
   DELETE
============================== */

export function deleteAlgorithm(id: string): Promise<{ message: string }> {
  return api.del<{ message: string }>(`/algorithms/${id}`);
}

/* ==============================
   GET RUNS
============================== */

export function getAlgorithmRuns(
  id: string
): Promise<{
  backtests: any[];
  paperRuns: any[];
}> {
  return api.get<{ backtests: any[]; paperRuns: any[] }>(`/algorithms/${id}/runs`);
}