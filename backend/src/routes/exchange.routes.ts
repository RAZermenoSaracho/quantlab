import { Router } from "express";
import { getExchanges } from "../controllers/exchange.controller";

const router = Router();

// Public for now (you can protect later if needed)
router.get("/", getExchanges);

export default router;
