import express from "express";
import cors from "cors";
import session from "express-session";
import passport from "passport";

import { pool } from "./config/db";
import { env } from "./config/env";
import { errorMiddleware } from "./middleware/error.middleware";

import authRoutes from "./routes/auth.routes";
import algorithmsRoutes from "./routes/algorithms.routes";
import backtestRoutes from "./routes/backtest.routes";
import exchangeRoutes from "./routes/exchange.routes";
import marketRoutes from "./routes/market.routes";

import "./config/passport";

const app = express();

/* =====================================================
   MIDDLEWARE
===================================================== */

// CORS (use FRONTEND_URL from .env)
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());

// Session
app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

/* =====================================================
   HEALTH CHECK
===================================================== */

app.get("/health", async (_req, res, next) => {
  try {
    const r = await pool.query("SELECT NOW() as now");
    return res.json({
      ok: true,
      db: r.rows[0].now,
    });
  } catch (err) {
    next(err);
  }
});

/* =====================================================
   ROUTES
===================================================== */

app.use("/api/auth", authRoutes);
app.use("/api/algorithms", algorithmsRoutes);
app.use("/api/backtest", backtestRoutes);
app.use("/api/exchanges", exchangeRoutes);
app.use("/api/market", marketRoutes);

/* =====================================================
   ERROR HANDLER
===================================================== */

app.use(errorMiddleware);

/* =====================================================
   START SERVER
===================================================== */

app.listen(env.PORT, () => {
  console.log(`
🚀 QuantLab API running on http://localhost:${env.PORT}
🔗 Engine URL: ${env.ENGINE_URL}
`);
});
