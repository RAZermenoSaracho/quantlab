import type { NextFunction, Request, Response } from "express";
import { pool } from "../config/db";
import {
  OptimizerRequestSchema,
  type ApiResponse,
  type OptimizerRanking,
} from "@quantlab/contracts";
import { runOptimizer } from "../services/optimizer.service";
import { sendError, sendSuccess } from "../utils/apiResponse";

type AlgorithmRow = {
  id: string;
  code: string;
};

export async function runOptimizerController(
  req: Request,
  res: Response<ApiResponse<OptimizerRanking>>,
  next: NextFunction
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return sendError(res, "Unauthorized", 401);
    }

    const payload = OptimizerRequestSchema.parse(req.body);

    const algorithmResult = await pool.query<AlgorithmRow>(
      `SELECT id, code
       FROM algorithms
       WHERE id = $1
         AND user_id = $2`,
      [payload.algorithmId, userId]
    );

    if (!algorithmResult.rowCount) {
      return sendError(res, "Algorithm not found", 404);
    }

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setFullYear(endDate.getFullYear() - 1);
    const baseline = payload.baseline;

    const ranking = await runOptimizer(
      algorithmResult.rows[0].code,
      {
        exchange: payload.exchange,
        symbol: payload.symbol,
        timeframe: baseline?.timeframe ?? "1h",
        initial_balance: baseline?.initial_balance ?? 1000,
        start_date: baseline?.start_date ?? startDate.toISOString(),
        end_date: baseline?.end_date ?? endDate.toISOString(),
        fee_rate: baseline?.fee_rate ?? null,
      },
      payload.paramSpace
    );

    return sendSuccess(res, ranking);
  } catch (error) {
    next(error);
  }
}
