import { Router } from "express";
import {
  createAlgorithm,
  getAlgorithms,
  getAlgorithmRanking,
  getAlgorithmById,
  deleteAlgorithm,
  updateAlgorithm,
  refreshAlgorithmFromGithub,
  getAlgorithmRuns,
} from "../controllers/algorithms.controller";
import { optionalAuth, requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.get("/ranking", optionalAuth, getAlgorithmRanking);
router.get("/:id/runs", optionalAuth, getAlgorithmRuns);
router.post("/", requireAuth, createAlgorithm);
router.get("/", requireAuth, getAlgorithms);
router.get("/:id", optionalAuth, getAlgorithmById);
router.put("/:id", requireAuth, updateAlgorithm);
router.post("/:id/refresh", requireAuth, refreshAlgorithmFromGithub);
router.delete("/:id", requireAuth, deleteAlgorithm);

export default router;
