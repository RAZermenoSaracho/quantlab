import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { pool } from "../config/db";
import { env } from "../config/env";

import {
  type ApiResponse,
  type AuthResponse,
  type MeResponse,
  type MessageResponse,
  RegisterRequestSchema,
  LoginRequestSchema,
  AuthUserSchema,
  AuthResponseSchema,
  MeResponseSchema,
} from "@quantlab/contracts";
import { sendError, sendSuccess } from "../utils/apiResponse";
import { z } from "zod";

type JwtPayload = { id: string; email: string };

function signToken(payload: JwtPayload) {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
}

const ChangePasswordRequestSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

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

export async function profile(
  req: Request,
  res: Response<
    ApiResponse<{
      id: string;
      email: string;
      provider: "google" | "github" | "password";
      created_at: string | null;
    }>
  >
) {
  const authUser = req.user;
  if (!authUser) {
    return sendError(res, "Unauthorized", 401);
  }

  const result = await pool.query(
    `
    SELECT id, email, password_hash, created_at
    FROM users
    WHERE id = $1
    `,
    [authUser.id]
  );

  if (!result.rowCount) {
    return sendError(res, "User not found", 404);
  }

  const row = result.rows[0] as {
    id: string;
    email: string;
    password_hash: string | null;
    created_at: Date | string | null;
  };

  const passwordHash = String(row.password_hash ?? "");
  const provider: "google" | "github" | "password" =
    passwordHash === "oauth_google"
      ? "google"
      : passwordHash === "oauth_github"
        ? "github"
        : "password";

  return sendSuccess(res, {
    id: row.id,
    email: row.email,
    provider,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at ?? null,
  });
}

export async function changePassword(
  req: Request,
  res: Response<ApiResponse<MessageResponse>>,
  next: NextFunction
) {
  try {
    const authUser = req.user;
    if (!authUser) {
      return sendError(res, "Unauthorized", 401);
    }

    const { current_password, new_password } =
      ChangePasswordRequestSchema.parse(req.body);

    const result = await pool.query(
      `
      SELECT id, password_hash
      FROM users
      WHERE id = $1
      `,
      [authUser.id]
    );

    if (!result.rowCount) {
      return sendError(res, "User not found", 404);
    }

    const row = result.rows[0] as { password_hash: string | null };
    const passwordHash = String(row.password_hash ?? "");

    if (passwordHash === "oauth_google" || passwordHash === "oauth_github") {
      return sendError(
        res,
        "Password change is not available for OAuth accounts",
        400
      );
    }

    const valid = await bcrypt.compare(current_password, passwordHash);
    if (!valid) {
      return sendError(res, "Current password is incorrect", 400);
    }

    const nextHash = await bcrypt.hash(new_password, 12);
    await pool.query(
      `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
      `,
      [nextHash, authUser.id]
    );

    return sendSuccess(res, { message: "Password updated" });
  } catch (error) {
    next(error);
  }
}
