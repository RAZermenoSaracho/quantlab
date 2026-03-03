import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { pool } from "../config/db";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

import {
  RegisterRequestSchema,
  LoginRequestSchema,
  AuthResponseSchema,
  AuthUserSchema,
} from "@quantlab/contracts";

function signToken(payload: { id: string; email: string }) {
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
  res: Response,
  next: NextFunction
) {
  try {
    // 🔥 VALIDATE INPUT WITH CONTRACT
    const { email, password } = RegisterRequestSchema.parse(req.body);

    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existing.rowCount && existing.rowCount > 0) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const created = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash]
    );

    const user = created.rows[0];

    // 🔥 VALIDATE USER STRUCTURE
    const safeUser = AuthUserSchema.parse(user);

    const token = signToken(safeUser);

    const response = {
      user: safeUser,
      token,
    };

    // 🔥 VALIDATE OUTPUT WITH CONTRACT
    return res.status(201).json(AuthResponseSchema.parse(response));
  } catch (err) {
    return next(err);
  }
}

/* =========================
   LOGIN
========================= */

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // 🔥 VALIDATE INPUT
    const { email, password } = LoginRequestSchema.parse(req.body);

    const found = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email]
    );

    if (!found.rowCount) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = found.rows[0];

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const safeUser = AuthUserSchema.parse({
      id: user.id,
      email: user.email,
    });

    const token = signToken(safeUser);

    const response = {
      user: safeUser,
      token,
    };

    return res.json(AuthResponseSchema.parse(response));
  } catch (err) {
    return next(err);
  }
}

/* =========================
   ME
========================= */

export async function me(req: Request, res: Response) {
  const user = (req as any).user as { id: string; email: string } | undefined;

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const safeUser = AuthUserSchema.parse(user);

  return res.json({ user: safeUser });
}