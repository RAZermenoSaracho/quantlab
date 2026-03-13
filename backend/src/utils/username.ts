import { pool } from "../config/db";

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export function normalizeUsername(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized.slice(0, 20);
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

export async function ensureUniqueUsername(baseInput: string): Promise<string> {
  const fallback = normalizeUsername(baseInput) || "user";
  const base = fallback.length >= 3 ? fallback : `${fallback}_user`.slice(0, 20);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? "" : `_${attempt + 1}`;
    const candidate = `${base.slice(0, Math.max(3, 20 - suffix.length))}${suffix}`;

    if (!isValidUsername(candidate)) {
      continue;
    }

    const result = await pool.query("SELECT 1 FROM users WHERE username = $1", [
      candidate,
    ]);

    if (!result.rowCount) {
      return candidate;
    }
  }

  throw new Error("Failed to generate a unique username");
}
