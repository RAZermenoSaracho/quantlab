import { Router } from "express";
import {
  createAlgorithm,
  getAlgorithms,
  getAlgorithmById,
  deleteAlgorithm,
  updateAlgorithm,
  refreshAlgorithmFromGithub,
  getAlgorithmRuns,
} from "../controllers/algorithms.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.get("/:id/runs", requireAuth, getAlgorithmRuns);
router.post("/", requireAuth, createAlgorithm);
router.get("/", requireAuth, getAlgorithms);
router.get("/:id", requireAuth, getAlgorithmById);
router.put("/:id", requireAuth, updateAlgorithm);
router.post("/:id/refresh", requireAuth, refreshAlgorithmFromGithub);
router.delete("/:id", requireAuth, deleteAlgorithm);

export default router;
