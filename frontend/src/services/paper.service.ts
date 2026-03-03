import api from "./api.service";
import type { PaperRun } from "@quantlab/contracts";
import type { PaperRunDetailResponse } from "@quantlab/contracts";

export interface StartPaperPayload {
  algorithm_id: string;
  exchange?: string;
  symbol: string;
  timeframe: string;
  initial_balance: number;
  fee_rate?: number;
  // algorithm_name: NO lo usa tu backend, no lo mandes
}

/* ================= START ================= */

export async function startPaperRun(payload: StartPaperPayload) {
  // backend: { run_id: string }
  return api.post<{ run_id: string }>("/paper/start", payload);
}

/* ================= STOP ================= */

export async function stopPaperRun(runId: string) {
  // backend: { message: string }
  return api.post<{ message: string }>(`/paper/stop/${runId}`, {});
}

/* ================= DELETE ================= */

export async function deletePaperRun(runId: string) {
  // backend: { message: string }
  return api.del<{ message: string }>(`/paper/${runId}`);
}

/* ================= GET ONE ================= */

export async function getPaperRunById(runId: string) {
  // backend: { run, trades }
  return api.get<PaperRunDetailResponse>(`/paper/${runId}`);
}

/* ================= GET ALL ================= */

export async function getAllPaperRuns() {
  // backend: { runs: PaperRun[] }
  return api.get<{ runs: PaperRun[] }>("/paper");
}