import type { Request, Response, NextFunction } from "express";
import { getSupportedExchanges } from "../services/exchangeCatalog.service";
import {
  getCandles as getExchangeCandles,
  getSymbols as getExchangeSymbols,
} from "../services/exchanges/exchange.service";
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

    const symbols = await getExchangeSymbols(exchange);

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
    if (err instanceof Error && err.message.startsWith("Unsupported exchange")) {
      return sendError(res, "Unsupported exchange", 400);
    }
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
    if (err instanceof Error && err.message.startsWith("Unsupported exchange")) {
      return sendError(res, "Unsupported exchange", 400);
    }
    next(err);
  }
}

export async function getCandles(
  req: Request,
  res: Response<ApiResponse<CandlesResponse>>,
  next: NextFunction
) {
  try {
    const { exchange, symbol, interval, limit } = req.query;

    const exchangeId =
      typeof exchange === "string" && exchange.length > 0
        ? exchange
        : "binance";

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

    const candles = await getExchangeCandles(
      exchangeId,
      symbol.toUpperCase(),
      interval,
      safeLimit
    );

    return sendSuccess(res, { candles });
  } catch (err) {
    next(err);
  }
}
