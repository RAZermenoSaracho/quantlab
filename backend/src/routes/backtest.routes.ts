import { Router } from "express";
import { createBacktest } from "../controllers/backtest.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { getBacktestById } from "../controllers/backtest.controller";

const router = Router();

router.post("/", requireAuth, createBacktest);
router.get("/:id", requireAuth, getBacktestById);

export default router;
