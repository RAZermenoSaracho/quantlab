import { Request, Response, NextFunction } from "express";
import { getBinanceSymbols } from "../services/binance.service";

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
