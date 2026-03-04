import { PaperTradeSide } from "@quantlab/contracts";

type TradeSideInput = {
  side?: unknown;
};

function readTradeSide(input: unknown): string {
  const normalized =
    typeof input === "object" && input !== null && "side" in input
      ? (input as TradeSideInput).side
      : input;

  return String(normalized ?? "").toUpperCase().trim();
}

/**
 * Canonical trade side for QuantLab is LONG | SHORT.
 * This function tolerates legacy inputs (BUY/SELL) but always returns LONG/SHORT.
 */
export function normalizeTradeSide(input: unknown): PaperTradeSide {
  const raw = readTradeSide(input);

  if (raw === "LONG" || raw === "BUY") return "LONG";
  if (raw === "SHORT" || raw === "SELL") return "SHORT";

  // Hard fallback: don't guess by prices; default to LONG to avoid DB errors.
  // Better to log upstream if this happens.
  return "LONG";
}

/**
 * Strong variant that throws if side is not recognizable.
 * Use this if you prefer failing fast at the boundary.
 */
export function assertTradeSide(input: unknown): PaperTradeSide {
  const raw = readTradeSide(input);

  if (raw === "LONG" || raw === "BUY") return "LONG";
  if (raw === "SHORT" || raw === "SELL") return "SHORT";

  throw new Error(`Invalid trade side: ${raw}`);
}

export function calculateTradePnl(
  side: PaperTradeSide,
  entryPrice: number,
  exitPrice: number,
  quantity: number
): number {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice)) {
    return 0;
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return 0;
  }

  if (side === "SHORT") {
    return (entryPrice - exitPrice) * quantity;
  }

  return (exitPrice - entryPrice) * quantity;
}

export function calculateTradePnlPercent(
  pnl: number,
  entryPrice: number,
  quantity: number
): number {
  const notional = entryPrice * quantity;
  if (!Number.isFinite(notional) || notional <= 0) {
    return 0;
  }

  return (pnl / notional) * 100;
}
