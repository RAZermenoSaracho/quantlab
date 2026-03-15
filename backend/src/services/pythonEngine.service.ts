import axios from "axios";
import { env } from "../config/env";
import {
  AlgorithmValidationRequestSchema,
  AlgorithmValidationResponseSchema,
  CandlesResponseSchema,
  StartPaperEngineRequestSchema,
  StartPaperEngineResponseSchema,
  StopPaperEngineResponseSchema,
  type AlgorithmValidationResult,
  type ApiSuccess,
  type Candle,
  type OptimizerEngineRequest,
  type OptimizerRanking,
  OptimizerResponseSchema,
  type PaperEngineActionResult,
  type StartPaperEngineRequest,
} from "@quantlab/contracts";

const engineClient = axios.create({
  baseURL: env.ENGINE_URL,
  timeout: 30000,
});

type EngineErrorPayload = {
  detail?: string;
  error?: string | { message?: string };
  message?: string;
};

function unwrapEngineResult<T>(value: T | { success: true; data: T }): T {
  return typeof value === "object" && value !== null && "success" in value
    ? (value as { success: true; data: T }).data
    : value;
}

function handleEngineError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as EngineErrorPayload | undefined;
    console.error("Engine error response:", payload ?? error.response?.data);

    const serializedPayload =
      payload == null
        ? undefined
        : typeof payload === "string"
          ? payload
          : JSON.stringify(payload);

    throw new Error(
      payload?.detail ||
      payload?.message ||
      (typeof payload?.error === "string"
        ? payload.error
        : payload?.error?.message) ||
      serializedPayload ||
      "Engine request failed"
    );
  }

  if (error instanceof Error) {
    throw error;
  }

  throw new Error("Engine service unavailable");
}

function parseEngineResponseBody(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function readEngineErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string") {
    return payload;
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as EngineErrorPayload;
  return (
    candidate.detail ||
    candidate.message ||
    (typeof candidate.error === "string"
      ? candidate.error
      : candidate.error?.message) ||
    null
  );
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
  payload: StartPaperEngineRequest & { symbols?: string[] }
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

export async function getEngineCandles(params: {
  exchange: string;
  symbol: string;
  timeframe: string;
  start: string;
  end: string;
}): Promise<Candle[]> {
  try {
    const response = await engineClient.get("/market/candles", { params });
    const unwrapped = unwrapEngineResult(response.data as {
      candles: Candle[];
    } | ApiSuccess<{ candles: Candle[] }>);
    const parsed = CandlesResponseSchema.parse(unwrapped);
    return parsed.candles;
  } catch (error: unknown) {
    handleEngineError(error);
  }
}

export async function runOptimizerOnEngine(
  payload: OptimizerEngineRequest
): Promise<OptimizerRanking> {
  try {
    console.log("Sending optimizer request to engine");
    const response = await engineClient.post<string>("/optimizer/run", payload, {
      timeout: 0,
      responseType: "text",
      transformResponse: [(data) => data],
      validateStatus: () => true,
    });
    console.log("Engine response status:", response.status);
    const body = parseEngineResponseBody(response.data);

    if (response.status < 200 || response.status >= 300) {
      console.error("Engine raw response:", response.data);
      throw new Error(
        readEngineErrorMessage(body) ||
          (typeof response.data === "string" ? response.data : JSON.stringify(body)) ||
          "Engine request failed"
      );
    }

    console.log("Engine optimizer response received");
    const parsed = OptimizerResponseSchema.parse(body);
    if (!parsed.success) {
      throw new Error(parsed.error.message);
    }
    return parsed.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error("Engine raw response:", error.response?.data);
    }
    handleEngineError(error);
  }
}
