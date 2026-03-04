import axios from "axios";
import { env } from "../config/env";
import {
  AlgorithmValidationRequestSchema,
  AlgorithmValidationResponseSchema,
  StartPaperEngineRequestSchema,
  StartPaperEngineResponseSchema,
  StopPaperEngineResponseSchema,
  type AlgorithmValidationResult,
  type ApiSuccess,
  type PaperEngineActionResult,
  type StartPaperEngineRequest,
} from "@quantlab/contracts";

const engineClient = axios.create({
  baseURL: env.ENGINE_URL,
  timeout: 30000,
});

type EngineErrorPayload = {
  detail?: string;
  error?: string;
};

function unwrapEngineResult<T>(value: T | { success: true; data: T }): T {
  return typeof value === "object" && value !== null && "success" in value
    ? (value as { success: true; data: T }).data
    : value;
}

function handleEngineError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as EngineErrorPayload | undefined;

    throw new Error(
      payload?.detail ||
      payload?.error ||
      "Engine request failed"
    );
  }

  if (error instanceof Error) {
    throw error;
  }

  throw new Error("Engine service unavailable");
}

export async function validateAlgorithm(
  code: string
): Promise<AlgorithmValidationResult> {
  try {
    const payload = AlgorithmValidationRequestSchema.parse({ code });
    const response = await engineClient.post("/validate", payload);
    const parsed = AlgorithmValidationResponseSchema.parse(response.data) as
      | AlgorithmValidationResult
      | ApiSuccess<AlgorithmValidationResult>;

    if (typeof parsed === "object" && parsed !== null && "success" in parsed) {
      return (parsed as ApiSuccess<AlgorithmValidationResult>).data;
    }

    return parsed as AlgorithmValidationResult;
  } catch (error: unknown) {
    handleEngineError(error);
  }
}

export async function startPaperOnEngine(
  payload: StartPaperEngineRequest
): Promise<PaperEngineActionResult> {
  try {
    const parsedPayload = StartPaperEngineRequestSchema.parse(payload);
    const response = await engineClient.post("/paper/start", parsedPayload);

    return unwrapEngineResult(
      StartPaperEngineResponseSchema.parse(response.data)
    );
  } catch (error: unknown) {
    handleEngineError(error);
  }
}

export async function stopPaperOnEngine(
  runId: string
): Promise<PaperEngineActionResult> {
  try {
    const response = await engineClient.post(`/paper/stop/${runId}`);

    return unwrapEngineResult(
      StopPaperEngineResponseSchema.parse(response.data)
    );
  } catch (error: unknown) {
    handleEngineError(error);
  }
}
