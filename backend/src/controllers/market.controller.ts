import { Request, Response, NextFunction } from "express";
import { getBinanceSymbols } from "../services/binance.service";
import { getSupportedExchanges } from "../services/exchangeCatalog.service";

export async function getSymbols(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { exchange, query } = req.query;

    if (!exchange || typeof exchange !== "string") {
      return res.status(400).json({ error: "exchange is required" });
    }

    if (exchange !== "binance") {
      return res.status(400).json({ error: "Unsupported exchange" });
    }

    const symbols = await getBinanceSymbols();

    const filtered = query
      ? symbols.filter(s =>
          s.symbol.toUpperCase().includes(String(query).toUpperCase())
        )
      : symbols;

    return res.json({ symbols: filtered.slice(0, 100) }); // limit results
  } catch (err) {
    next(err);
  }
}

export function getFeeRate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { exchange } = req.query;

    if (!exchange || typeof exchange !== "string") {
      return res.status(400).json({ error: "exchange is required" });
    }

    const catalog = getSupportedExchanges();
    const ex = catalog.find(e => e.id === exchange);

    if (!ex) {
      return res.status(400).json({ error: "Unsupported exchange" });
    }

    return res.json({
      exchange: ex.id,
      default_fee_rate: ex.default_fee_rate
    });

  } catch (err) {
    next(err);
  }
}
