import type { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { pool } from "../config/db";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

function signToken(payload: { id: string; email: string }) {
    const options: SignOptions = {
        expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    };

    return jwt.sign(payload, env.JWT_SECRET, options);
}

export async function register(req: Request, res: Response, next: NextFunction) {
    try {
        const { email, password } = req.body as { email?: string; password?: string };

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters" });
        }

        const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existing.rowCount && existing.rowCount > 0) {
            return res.status(409).json({ error: "Email already in use" });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const created = await pool.query(
            "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
            [email, passwordHash]
        );

        const user = created.rows[0];
        const token = signToken({ id: user.id, email: user.email });

        return res.status(201).json({ user, token });
    } catch (err) {
        return next(err);
    }
}

export async function login(req: Request, res: Response, next: NextFunction) {
    try {
        const { email, password } = req.body as { email?: string; password?: string };

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

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

        const token = signToken({ id: user.id, email: user.email });

        return res.json({ user: { id: user.id, email: user.email }, token });
    } catch (err) {
        return next(err);
    }
}

export async function me(req: Request, res: Response) {
    // This assumes requireAuth middleware already ran
    // We’ll just echo back user data from JWT
    const user = (req as any).user as { id: string; email: string } | undefined;
    return res.json({ user });
}
