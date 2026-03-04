import type { Request, Response, NextFunction } from "express";
import { getSupportedExchanges } from "../services/exchangeCatalog.service";
import type { ApiResponse, ExchangesListResponse } from "@quantlab/contracts";
import { sendSuccess } from "../utils/apiResponse";

export function getExchanges(
  req: Request,
  res: Response<ApiResponse<ExchangesListResponse>>,
  next: NextFunction
) {
  try {
    const exchanges = getSupportedExchanges().map((exchange) => ({
      id: exchange.id,
      name: exchange.name,
      default_fee_rate: exchange.default_fee_rate,
    }));

    return sendSuccess(res, {
      exchanges
    });
  } catch (err) {
    next(err);
  }
}
