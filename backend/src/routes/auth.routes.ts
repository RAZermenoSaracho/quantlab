import { Router, Request, Response } from "express";
import {
  checkUsernameAvailability,
  changePassword,
  login,
  me,
  profile,
  publicProfile,
  register,
  updateProfile,
} from "../controllers/auth.controller";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware";
import passport from "passport";
import { env } from "../config/env";
import jwt, { SignOptions } from "jsonwebtoken";
import { AuthResponseSchema } from "@quantlab/contracts";

const router = Router();

/* ================= BASIC AUTH ================= */

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, me);
router.get("/profile", requireAuth, profile);
router.put("/profile", requireAuth, updateProfile);
router.get("/profile/:username", publicProfile);
router.get("/username-availability", optionalAuth, checkUsernameAvailability);
router.post("/change-password", requireAuth, changePassword);

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

    const { id, email, username } = req.user as {
      id: string;
      email: string;
      username?: string | null;
    };

    const signOptions: SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    };

    const token = jwt.sign(
      { id, email },
      env.JWT_SECRET,
      signOptions
    );

    const response = AuthResponseSchema.parse({
      user: { id, email, username: username ?? null },
      token,
    });

    const encoded = encodeURIComponent(JSON.stringify(response));

    return res.redirect(
      `${env.FRONTEND_URL}/oauth-success?payload=${encoded}`
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

    const { id, email, username } = req.user as {
      id: string;
      email: string;
      username?: string | null;
    };

    const signOptions: SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    };

    const token = jwt.sign(
      { id, email },
      env.JWT_SECRET,
      signOptions
    );

    const response = AuthResponseSchema.parse({
      user: { id, email, username: username ?? null },
      token,
    });

    const encoded = encodeURIComponent(JSON.stringify(response));

    return res.redirect(
      `${env.FRONTEND_URL}/oauth-success?payload=${encoded}`
    );
  }
);

export default router;
