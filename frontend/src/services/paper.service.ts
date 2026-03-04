import api from "./api.service";

import type {
  PaperRunDetailResponse,
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

/* ================= DELETE ================= */

export function deletePaperRun(runId: string): Promise<MessageResponse> {
  return api.del<MessageResponse>(`/paper/${runId}`);
}

/* ================= GET ONE ================= */

export function getPaperRunById(runId: string): Promise<PaperRunDetailResponse> {
  return api.get<PaperRunDetailResponse>(`/paper/${runId}`);
}

/* ================= GET ALL ================= */

export function getAllPaperRuns(): Promise<PaperRunsListResponse> {
  return api.get<PaperRunsListResponse>("/paper");
}