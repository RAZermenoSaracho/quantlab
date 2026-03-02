import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import { pool } from "./config/db";
import { env } from "./config/env";
import { errorMiddleware } from "./middleware/error.middleware";

import authRoutes from "./routes/auth.routes";
import algorithmsRoutes from "./routes/algorithms.routes";
import backtestRoutes from "./routes/backtest.routes";
import exchangeRoutes from "./routes/exchange.routes";
import marketRoutes from "./routes/market.routes";
import paperRoutes from "./routes/paper.routes";

import { initializeWebsocket } from "./services/websocketManager.service";

const app = express();

/* =====================================================
   MIDDLEWARE
===================================================== */

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true, // required for Socket.IO + cookies if ever needed
  })
);

app.use(express.json());

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
app.use("/api/backtests", backtestRoutes);
app.use("/api/exchanges", exchangeRoutes);
app.use("/api/market", marketRoutes);
app.use("/api/paper", paperRoutes);

/* =====================================================
   ERROR HANDLER
===================================================== */

app.use(errorMiddleware);

/* =====================================================
   SOCKET.IO SETUP
===================================================== */

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.FRONTEND_URL,
    credentials: true,
  },
});

initializeWebsocket(io);

/* =====================================================
   START SERVER
===================================================== */

server.listen(env.PORT, () => {
  console.log(`
🚀 QuantLab API running on http://localhost:${env.PORT}
🔗 Engine URL: ${env.ENGINE_URL}
📡 WebSocket enabled
`);
});
