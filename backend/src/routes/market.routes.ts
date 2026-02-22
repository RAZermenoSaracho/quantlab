import { Router } from "express";
import { getSymbols } from "../controllers/market.controller";
import { getFeeRate } from "../controllers/market.controller";

const router = Router();

router.get("/symbols", getSymbols);
router.get("/fee-rate", getFeeRate);

export default router;
