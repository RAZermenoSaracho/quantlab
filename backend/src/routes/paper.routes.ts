import { Router } from "express";
import {
  startPaperRun,
  stopPaperRun,
  receivePaperEvent,
  getPaperRunById,
  getAllPaperRuns,
  deletePaperRun,
} from "../controllers/paper.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/* =====================================================
   INTERNAL ENGINE EVENT ROUTE (NO AUTH)
===================================================== */

router.post("/internal/event", receivePaperEvent);

/* =====================================================
   AUTHENTICATED USER ROUTES (JWT)
===================================================== */

router.post("/start", requireAuth, startPaperRun);
router.post("/stop/:id", requireAuth, stopPaperRun);
router.get("/", requireAuth, getAllPaperRuns);
router.get("/:id", requireAuth, getPaperRunById);
router.delete("/:id", requireAuth, deletePaperRun);

export default router;