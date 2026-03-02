export type DbTradeSide = "BUY" | "SELL";

export function normalizeTradeSide(trade: any): DbTradeSide {
  const raw = String(trade?.side ?? "").toUpperCase().trim();

  // Engine might send LONG/SHORT or BUY/SELL
  if (raw === "LONG" || raw === "BUY") return "BUY";
  if (raw === "SHORT" || raw === "SELL") return "SELL";

  // fallback heuristic
  const entry = Number(trade?.entry_price ?? 0);
  const exit = Number(trade?.exit_price ?? 0);

  if (Number.isFinite(entry) && Number.isFinite(exit)) {
    return entry < exit ? "BUY" : "SELL";
  }

  // safest default
  return "BUY";
}