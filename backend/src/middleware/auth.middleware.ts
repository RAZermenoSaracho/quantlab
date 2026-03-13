import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { ApiError } from "@quantlab/contracts";
import { env } from "../config/env";
import { sendError } from "../utils/apiResponse";

type DecodedUser = {
  id: string;
  email: string;
  username?: string | null;
};

function readBearerToken(header?: string) {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length);
}

function decodeUser(token: string): DecodedUser {
  return jwt.verify(token, env.JWT_SECRET) as DecodedUser;
}

export function requireAuth(
  req: Request,
  res: Response<ApiError>,
  next: NextFunction
) {
  const token = readBearerToken(req.headers.authorization);

  if (!token) {
    return sendError(res, "Missing or invalid Authorization header", 401);
  }

  try {
    const decoded = decodeUser(token);
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch {
    return sendError(res, "Invalid or expired token", 401);
  }
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const token = readBearerToken(req.headers.authorization);

  if (!token) {
    next();
    return;
  }

  try {
    const decoded = decodeUser(token);
    req.user = { id: decoded.id, email: decoded.email };
  } catch {
    req.user = undefined;
  }

  next();
}
