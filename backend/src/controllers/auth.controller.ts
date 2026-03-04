import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { pool } from "../config/db";
import { env } from "../config/env";

import {
  type ApiResponse,
  type AuthResponse,
  type MeResponse,
  RegisterRequestSchema,
  LoginRequestSchema,
  AuthUserSchema,
  AuthResponseSchema,
  MeResponseSchema,
} from "@quantlab/contracts";
import { sendError, sendSuccess } from "../utils/apiResponse";

type JwtPayload = { id: string; email: string };

function signToken(payload: JwtPayload) {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
}

/* =========================
   REGISTER
========================= */

export async function register(
  req: Request,
  res: Response<ApiResponse<AuthResponse>>,
  next: NextFunction
) {
  try {
    const { email, password } = RegisterRequestSchema.parse(req.body);

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);

    if (existing.rowCount && existing.rowCount > 0) {
      return sendError(res, "Email already in use", 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const created = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash]
    );

    const safeUser = AuthUserSchema.parse(created.rows[0]);
    const token = signToken({ id: safeUser.id, email: safeUser.email });

    const response = AuthResponseSchema.parse({
      user: safeUser,
      token,
    });

    return sendSuccess(res, response, 201);
  } catch (err) {
    return next(err);
  }
}

/* =========================
   LOGIN
========================= */

export async function login(
  req: Request,
  res: Response<ApiResponse<AuthResponse>>,
  next: NextFunction
) {
  try {
    const { email, password } = LoginRequestSchema.parse(req.body);

    const found = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email]
    );

    if (!found.rowCount) {
      return sendError(res, "Invalid credentials", 401);
    }

    const row = found.rows[0] as {
      id: string;
      email: string;
      password_hash: string;
    };

    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      return sendError(res, "Invalid credentials", 401);
    }

    const safeUser = AuthUserSchema.parse({ id: row.id, email: row.email });
    const token = signToken({ id: safeUser.id, email: safeUser.email });

    const response = AuthResponseSchema.parse({
      user: safeUser,
      token,
    });

    return sendSuccess(res, response);
  } catch (err) {
    return next(err);
  }
}

/* =========================
   ME
========================= */

export async function me(req: Request, res: Response<ApiResponse<MeResponse>>) {
  const user = req.user;

  if (!user) {
    return sendError(res, "Unauthorized", 401);
  }

  const safeUser = AuthUserSchema.parse(user);

  const response = MeResponseSchema.parse({
    user: safeUser,
  });

  return sendSuccess(res, response);
}
