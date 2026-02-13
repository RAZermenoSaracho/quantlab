import { Router } from "express";
import { createBacktest, getAllBacktests, getBacktestById } from "../controllers/backtest.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.get("/", requireAuth, getAllBacktests);
router.get("/:id", requireAuth, getBacktestById);
router.post("/create", requireAuth, createBacktest);

export default router;
