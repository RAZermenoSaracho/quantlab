export function toDateFromEngineTs(ts: any): Date {
  // Engine can send ms epoch, seconds epoch, or ISO string
  if (ts == null) return new Date();

  if (typeof ts === "number") {
    // heuristic: ms epoch usually > 10_000_000_000
    return ts > 10_000_000_000 ? new Date(ts) : new Date(ts * 1000);
  }

  const asNum = Number(ts);
  if (Number.isFinite(asNum)) {
    return asNum > 10_000_000_000 ? new Date(asNum) : new Date(asNum * 1000);
  }

  return new Date(String(ts));
}