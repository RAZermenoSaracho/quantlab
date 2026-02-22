import { Request, Response, NextFunction } from "express";

export function errorMiddleware(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(err);

  const status = err.status || 500;

  return res.status(status).json({
    success: false,
    error: {
      message: err.message || "Internal server error",
    },
  });
}
