import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../config/db";
import { env } from "../config/env";

import {
  type ApiResponse,
  type AuthResponse,
  type MeResponse,
  type MessageResponse,
  type PublicProfileResponse,
  RegisterRequestSchema,
  LoginRequestSchema,
  AuthUserSchema,
  AuthResponseSchema,
  MeResponseSchema,
} from "@quantlab/contracts";
import { sendError, sendSuccess } from "../utils/apiResponse";
import {
  ensureUniqueUsername,
  isValidUsername,
  normalizeUsername,
} from "../utils/username";

type JwtPayload = { id: string; email: string };

type UserRow = {
  id: string;
  email: string;
  username: string | null;
  password_hash?: string | null;
  created_at?: Date | string | null;
};

function signToken(payload: JwtPayload) {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, env.JWT_SECRET, options);
}

function toSafeUser(row: UserRow) {
  return AuthUserSchema.parse({
    id: row.id,
    email: row.email,
    username: row.username ?? null,
  });
}

function passwordProvider(passwordHash: string | null | undefined) {
  if (passwordHash === "oauth_google") {
    return "google" as const;
  }
  if (passwordHash === "oauth_github") {
    return "github" as const;
  }
  return "password" as const;
}

const ChangePasswordRequestSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

const UpdateProfileSchema = z.object({
  username: z.string().trim().min(3).max(20),
});

const UsernameQuerySchema = z.object({
  username: z.string().trim().default(""),
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

    const created = await pool.query<UserRow>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, username",
      [email, passwordHash]
    );

    const safeUser = toSafeUser(created.rows[0]);
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

    const found = await pool.query<UserRow>(
      "SELECT id, email, username, password_hash FROM users WHERE email = $1",
      [email]
    );

    if (!found.rowCount) {
      return sendError(res, "Invalid credentials", 401);
    }

    const row = found.rows[0];

    const ok = await bcrypt.compare(password, String(row.password_hash ?? ""));
    if (!ok) {
      return sendError(res, "Invalid credentials", 401);
    }

    const safeUser = toSafeUser(row);
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
  const authUser = req.user;

  if (!authUser) {
    return sendError(res, "Unauthorized", 401);
  }

  const result = await pool.query<UserRow>(
    `
    SELECT id, email, username
    FROM users
    WHERE id = $1
    `,
    [authUser.id]
  );

  if (!result.rowCount) {
    return sendError(res, "User not found", 404);
  }

  const safeUser = toSafeUser(result.rows[0]);
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
      username: string | null;
      provider: "google" | "github" | "password";
      created_at: string | null;
    }>
  >
) {
  const authUser = req.user;
  if (!authUser) {
    return sendError(res, "Unauthorized", 401);
  }

  const result = await pool.query<UserRow>(
    `
    SELECT id, email, username, password_hash, created_at
    FROM users
    WHERE id = $1
    `,
    [authUser.id]
  );

  if (!result.rowCount) {
    return sendError(res, "User not found", 404);
  }

  const row = result.rows[0];

  return sendSuccess(res, {
    id: row.id,
    email: row.email,
    username: row.username ?? null,
    provider: passwordProvider(row.password_hash),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at ?? null,
  });
}

export async function updateProfile(
  req: Request,
  res: Response<ApiResponse<{ id: string; email: string; username: string }>>,
  next: NextFunction
) {
  try {
    const authUser = req.user;
    if (!authUser) {
      return sendError(res, "Unauthorized", 401);
    }

    const parsed = UpdateProfileSchema.parse(req.body);
    const username = normalizeUsername(parsed.username);

    if (!isValidUsername(username)) {
      return sendError(
        res,
        "Username must be 3-20 characters and use only letters, numbers, or underscores",
        400
      );
    }

    const existing = await pool.query(
      `
      SELECT id
      FROM users
      WHERE username = $1
        AND id <> $2
      `,
      [username, authUser.id]
    );

    if (existing.rowCount) {
      return sendError(res, "Username is already in use", 409);
    }

    const updated = await pool.query<UserRow>(
      `
      UPDATE users
      SET username = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING id, email, username
      `,
      [username, authUser.id]
    );

    return sendSuccess(res, {
      id: updated.rows[0].id,
      email: updated.rows[0].email,
      username: updated.rows[0].username ?? username,
    });
  } catch (error) {
    next(error);
  }
}

export async function checkUsernameAvailability(
  req: Request,
  res: Response<
    ApiResponse<{
      username: string;
      valid: boolean;
      available: boolean;
    }>
  >
) {
  const authUser = req.user;
  const parsed = UsernameQuerySchema.parse(req.query);
  const username = normalizeUsername(parsed.username);
  const valid = isValidUsername(username);

  if (!valid) {
    return sendSuccess(res, {
      username,
      valid: false,
      available: false,
    });
  }

  const existing = await pool.query(
    `
    SELECT id
    FROM users
    WHERE username = $1
      AND ($2::uuid IS NULL OR id <> $2::uuid)
    `,
    [username, authUser?.id ?? null]
  );

  return sendSuccess(res, {
    username,
    valid: true,
    available: !existing.rowCount,
  });
}

export async function publicProfile(
  req: Request,
  res: Response<ApiResponse<PublicProfileResponse>>
) {
  const username = String(req.params.username);
  const normalized = normalizeUsername(username);

  if (!isValidUsername(normalized)) {
    return sendError(res, "User not found", 404);
  }

  const user = await pool.query<{ id: string; username: string }>(
    `
    SELECT id, username
    FROM users
    WHERE username = $1
    `,
    [normalized]
  );

  if (!user.rowCount) {
    return sendError(res, "User not found", 404);
  }

  const algorithms = await pool.query(
    `
    SELECT a.id,
           a.name,
           COALESCE(a.performance_score, 0) AS performance_score,
           COALESCE(a.avg_return_percent, 0) AS avg_return_percent,
           COALESCE(a.avg_sharpe, 0) AS avg_sharpe,
           COALESCE(a.max_drawdown, 0) AS max_drawdown,
           COALESCE(a.runs_count, 0) AS runs_count,
           a.user_id,
           u.username,
           COALESCE(a.is_public, false) AS is_public
    FROM algorithms a
    INNER JOIN users u
      ON u.id = a.user_id
    WHERE a.user_id = $1
    ORDER BY a.performance_score DESC NULLS LAST, a.created_at DESC
    LIMIT 100
    `,
    [user.rows[0].id]
  );

  return sendSuccess(res, {
    username: user.rows[0].username,
    algorithms: algorithms.rows.map((row) => ({
      id: row.id,
      name: row.name,
      performance_score: Number(row.performance_score ?? 0),
      avg_return_percent: Number(row.avg_return_percent ?? 0),
      avg_sharpe: Number(row.avg_sharpe ?? 0),
      max_drawdown: Number(row.max_drawdown ?? 0),
      runs_count: Number(row.runs_count ?? 0),
      user_id: row.user_id,
      username: row.username ?? null,
      is_public: Boolean(row.is_public),
    })),
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

    const result = await pool.query<UserRow>(
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

    const passwordHash = String(result.rows[0].password_hash ?? "");

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

export async function ensureOauthUsername(
  email: string,
  passwordHash: "oauth_google" | "oauth_github",
  suggestedUsername: string
) {
  const user = await pool.query<UserRow>(
    `
    SELECT id, email, username
    FROM users
    WHERE email = $1
    `,
    [email]
  );

  if (!user.rowCount) {
    const username = await ensureUniqueUsername(suggestedUsername);
    const created = await pool.query<UserRow>(
      `
      INSERT INTO users (email, password_hash, username)
      VALUES ($1, $2, $3)
      RETURNING id, email, username
      `,
      [email, passwordHash, username]
    );

    return created.rows[0];
  }

  if (!user.rows[0].username) {
    const username = await ensureUniqueUsername(suggestedUsername);
    const updated = await pool.query<UserRow>(
      `
      UPDATE users
      SET username = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING id, email, username
      `,
      [username, user.rows[0].id]
    );

    return updated.rows[0];
  }

  return user.rows[0];
}
