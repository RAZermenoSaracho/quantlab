import type { Request, Response, NextFunction } from "express";
import {
  getBinanceCandles,
  getBinanceSymbols,
} from "../services/binance.service";
import { getSupportedExchanges } from "../services/exchangeCatalog.service";
import type {
  ApiResponse,
  CandlesResponse,
  DefaultFeeRateResponse,
  SymbolsListResponse,
} from "@quantlab/contracts";
import { sendError, sendSuccess } from "../utils/apiResponse";

export async function getSymbols(
  req: Request,
  res: Response<ApiResponse<SymbolsListResponse>>,
  next: NextFunction
) {
  try {
    const { exchange, query } = req.query;

    if (!exchange || typeof exchange !== "string") {
      return sendError(res, "exchange is required", 400);
    }

    if (exchange !== "binance") {
      return sendError(res, "Unsupported exchange", 400);
    }

    const symbols = await getBinanceSymbols();

    const filtered = query
      ? symbols.filter(s =>
          s.symbol.toUpperCase().includes(String(query).toUpperCase())
        )
      : symbols;

    return sendSuccess(res, {
      symbols: filtered.slice(0, 100).map((item) => ({
        symbol: item.symbol,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export function getFeeRate(
  req: Request,
  res: Response<ApiResponse<DefaultFeeRateResponse>>,
  next: NextFunction
) {
  try {
    const { exchange } = req.query;

    if (!exchange || typeof exchange !== "string") {
      return sendError(res, "exchange is required", 400);
    }

    const catalog = getSupportedExchanges();
    const ex = catalog.find(e => e.id === exchange);

    if (!ex) {
      return sendError(res, "Unsupported exchange", 400);
    }

    return sendSuccess(res, {
      default_fee_rate: ex.default_fee_rate
    });
  } catch (err) {
    next(err);
  }
}

export async function getCandles(
  req: Request,
  res: Response<ApiResponse<CandlesResponse>>,
  next: NextFunction
) {
  try {
    const { symbol, interval, limit } = req.query;

    if (!symbol || typeof symbol !== "string") {
      return sendError(res, "symbol is required", 400);
    }

    if (!interval || typeof interval !== "string") {
      return sendError(res, "interval is required", 400);
    }

    const parsedLimit = Number(limit ?? 500);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, 50000))
      : 500;

    const candles = await getBinanceCandles(
      symbol.toUpperCase(),
      interval,
      safeLimit
    );

    return sendSuccess(res, { candles });
  } catch (err) {
    next(err);
  }
}
