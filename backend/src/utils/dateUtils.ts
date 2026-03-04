export function toDateFromEngineTs(ts: unknown): Date {
  if (ts == null) return new Date();

  if (typeof ts === "number") {
    // ms vs seconds heuristic
    return ts > 10_000_000_000 ? new Date(ts) : new Date(ts * 1000);
  }

  const asNum = Number(ts);
  if (Number.isFinite(asNum)) {
    return asNum > 10_000_000_000 ? new Date(asNum) : new Date(asNum * 1000);
  }

  return new Date(String(ts));
}

export function toIsoOrNull(d: any): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}