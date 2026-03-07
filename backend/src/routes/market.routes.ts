import { Router } from "express";
import {
  getCandles,
  getFeeRate,
  getSymbols,
} from "../controllers/market.controller";

const router = Router();

router.get("/symbols", getSymbols);
router.get("/fee-rate", getFeeRate);
router.get("/candles", getCandles);

export default router;
