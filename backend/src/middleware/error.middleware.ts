import type { Request, Response, NextFunction } from "express";
import type { ApiError } from "@quantlab/contracts";
import { failure } from "../utils/apiResponse";

type ErrorWithStatus = Error & {
  status?: number;
};

export function errorMiddleware(
  err: ErrorWithStatus,
  _req: Request,
  res: Response<ApiError>,
  _next: NextFunction
) {
  console.error(err);

  const status = err.status || 500;

  return res.status(status).json(
    failure(err.message || "Internal server error")
  );
}
