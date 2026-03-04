import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { ApiError } from "@quantlab/contracts";
import { env } from "../config/env";
import { sendError } from "../utils/apiResponse";

export function requireAuth(
  req: Request,
  res: Response<ApiError>,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return sendError(res, "Missing or invalid Authorization header", 401);
  }

  const token = header.slice("Bearer ".length);

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      id: string;
      email: string;
    };

    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch {
    return sendError(res, "Invalid or expired token", 401);
  }
}
