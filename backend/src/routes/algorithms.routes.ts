import { Router } from "express";
import {
    createAlgorithm,
    getAlgorithms,
    getAlgorithmById,
    deleteAlgorithm
} from "../controllers/algorithms.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth, createAlgorithm);
router.get("/", requireAuth, getAlgorithms);
router.get("/:id", requireAuth, getAlgorithmById);
router.delete("/:id", requireAuth, deleteAlgorithm);

export default router;
