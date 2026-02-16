import { Router, Request, Response } from "express";
import { login, me, register } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";
import passport from "passport";
import { env } from "../config/env";
import jwt, { SignOptions } from "jsonwebtoken";

const router = Router();

/* ================= BASIC AUTH ================= */

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, me);

/* ================= GOOGLE ================= */

router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "OAuth failed" });
    }

    const { id, email } = req.user as {
      id: string;
      email: string;
    };

    const signOptions: SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    };

    const token = jwt.sign(
      { id, email },
      env.JWT_SECRET,
      signOptions
    );

    return res.redirect(
      `${env.FRONTEND_URL}/oauth-success?token=${token}&email=${email}&id=${id}`
    );
  }
);

/* ================= GITHUB ================= */

router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"] })
);

router.get(
  "/github/callback",
  passport.authenticate("github", { session: false }),
  (req: Request, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "OAuth failed" });
    }

    const { id, email } = req.user as {
      id: string;
      email: string;
    };

    const signOptions: SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    };

    const token = jwt.sign(
      { id, email },
      env.JWT_SECRET,
      signOptions
    );

    return res.redirect(
      `${env.FRONTEND_URL}/oauth-success?token=${token}&email=${email}&id=${id}`
    );
  }
);

export default router;
