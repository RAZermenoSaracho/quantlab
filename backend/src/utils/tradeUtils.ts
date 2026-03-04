import { PaperTradeSide } from "@quantlab/contracts";

/**
 * Canonical trade side for QuantLab is LONG | SHORT.
 * This function tolerates legacy inputs (BUY/SELL) but always returns LONG/SHORT.
 */
export function normalizeTradeSide(input: unknown): PaperTradeSide {
  const raw = String((input as any)?.side ?? input ?? "")
    .toUpperCase()
    .trim();

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
  const raw = String((input as any)?.side ?? input ?? "")
    .toUpperCase()
    .trim();

  if (raw === "LONG" || raw === "BUY") return "LONG";
  if (raw === "SHORT" || raw === "SELL") return "SHORT";

  throw new Error(`Invalid trade side: ${raw}`);
}