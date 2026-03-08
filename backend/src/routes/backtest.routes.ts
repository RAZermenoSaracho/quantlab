import { Router } from "express";
import {
  createBacktest,
  getAllBacktests,
  getBacktestById,
  deleteBacktest,
  getBacktestStatus,
  rerunBacktest,
} from "../controllers/backtest.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.get("/:id/status", requireAuth, getBacktestStatus);
router.post("/:id/rerun", requireAuth, rerunBacktest);
router.get("/", requireAuth, getAllBacktests);
router.post("/", requireAuth, createBacktest);
router.get("/:id", requireAuth, getBacktestById);
router.delete("/:id", requireAuth, deleteBacktest);

export default router;
