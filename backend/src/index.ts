import express from "express";
import cors from "cors";
import { pool } from "./config/db";
import { env } from "./config/env";
import { errorMiddleware } from "./middleware/error.middleware";
import authRoutes from "./routes/auth.routes";
import algorithmsRoutes from "./routes/algorithms.routes";
import backtestRoutes from "./routes/backtest.routes";

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", async (_req, res) => {
    const r = await pool.query("SELECT NOW() as now");
    res.json({ ok: true, db: r.rows[0].now });
});

app.use("/api/auth", authRoutes);
app.use("/api/algorithms", algorithmsRoutes);
app.use("/api/backtest", backtestRoutes);

app.use(errorMiddleware);

app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${env.PORT}`);
});
