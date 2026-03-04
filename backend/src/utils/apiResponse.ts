import type { Response } from "express";
import type { ApiError, ApiSuccess } from "@quantlab/contracts";

export function success<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function failure(message: string, details?: unknown): ApiError {
  return {
    success: false,
    error: {
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export function sendSuccess<T>(
  res: Response<ApiSuccess<T>>,
  data: T,
  status = 200
) {
  return res.status(status).json(success(data));
}

export function sendError(
  res: Response<ApiError>,
  message: string,
  status = 400,
  details?: unknown
) {
  return res.status(status).json(failure(message, details));
}
