import { Router } from "express";
import { getSymbols } from "../controllers/market.controller";

const router = Router();

router.get("/symbols", getSymbols);

export default router;
