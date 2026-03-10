import api from "./api.service";

import type {
  PortfolioState,
  PaperRunDetailResponse,
  PaperRunChartResponse,
  PaperRunsListResponse,
  StartPaperRunRequest,
  StartPaperRunResponse,
  MessageResponse,
} from "@quantlab/contracts";

/* ================= START ================= */

export function startPaperRun(
  payload: StartPaperRunRequest
): Promise<StartPaperRunResponse> {
  return api.post<StartPaperRunResponse>("/paper/start", payload);
}

/* ================= STOP ================= */

export function stopPaperRun(runId: string): Promise<MessageResponse> {
  return api.post<MessageResponse>(`/paper/stop/${runId}`, {});
}

/* ================= RESTART ================= */

export function restartPaperRun(runId: string): Promise<StartPaperRunResponse> {
  return api.post<StartPaperRunResponse>(`/paper/restart/${runId}`, {});
}

/* ================= DELETE ================= */

export function deletePaperRun(runId: string): Promise<MessageResponse> {
  return api.del<MessageResponse>(`/paper/${runId}`);
}

/* ================= GET ONE ================= */

export function getPaperRunById(runId: string): Promise<PaperRunDetailResponse> {
  return api.get<PaperRunDetailResponse>(`/paper/${runId}`);
}

/* ================= GET CHART DATA ================= */

export function getPaperRunChart(runId: string): Promise<PaperRunChartResponse> {
  return api.get<PaperRunChartResponse>(`/paper/${runId}/chart`);
}

/* ================= GET PORTFOLIO STATE ================= */

export function getPaperRunState(runId: string): Promise<PortfolioState> {
  return api.get<PortfolioState>(`/paper/${runId}/state`);
}

/* ================= GET ALL ================= */

export function getAllPaperRuns(): Promise<PaperRunsListResponse> {
  return api.get<PaperRunsListResponse>("/paper");
}
