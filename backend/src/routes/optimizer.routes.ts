import { Router } from "express";
import { runOptimizerController } from "../controllers/optimizer.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/run", requireAuth, runOptimizerController);

export default router;
