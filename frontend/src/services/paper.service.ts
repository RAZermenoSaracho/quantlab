import api from "./api.service";
import type { PaperRun } from "../types/models";
import type { PaperRunDetailResponse } from "../types/api.types";

export interface StartPaperPayload {
  algorithm_id: string;
  exchange: string;
  symbol: string;
  timeframe: string;
  initial_balance: number;
  fee_rate?: number;
}

/* ================= START ================= */

export async function startPaperRun(payload: StartPaperPayload) {
  return api.post<{ run_id: string }>("/paper/start", payload);
}

/* ================= STOP ================= */

export async function stopPaperRun(runId: string) {
  return api.post<{ success: boolean }>(`/paper/stop/${runId}`, {});
}

/* ================= DELETE ================= */

export async function deletePaperRun(runId: string) {
  return api.del<{ success: boolean }>(`/paper/${runId}`);
}

/* ================= GET ONE ================= */

export async function getPaperRunById(runId: string) {
  return api.get<PaperRunDetailResponse>(`/paper/${runId}`);
}

/* ================= GET ALL ================= */

export async function getAllPaperRuns() {
  return api.get<{ runs: PaperRun[] }>("/paper");
}