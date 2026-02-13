import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type AuthRequest = Request & { user?: { id: string; email: string } };

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    const token = header.slice("Bearer ".length);

    try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as { id: string; email: string };
        req.user = { id: decoded.id, email: decoded.email };
        return next();
    } catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}
