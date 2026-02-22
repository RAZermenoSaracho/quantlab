import { Request, Response, NextFunction } from "express";
import { getSupportedExchanges } from "../services/exchangeCatalog.service";

export function getExchanges(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const exchanges = getSupportedExchanges();

    return res.json({
      exchanges
    });
  } catch (err) {
    next(err);
  }
}
