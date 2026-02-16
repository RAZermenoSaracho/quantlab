import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

export const env = {
  /* ===============================
     SERVER
  =============================== */
  PORT: Number(process.env.PORT || 5000),
  BACKEND_URL: requireEnv("BACKEND_URL"),

  /* ===============================
     DATABASE
  =============================== */
  DATABASE_URL: requireEnv("DATABASE_URL"),

  /* ===============================
     AUTH
  =============================== */
  JWT_SECRET: requireEnv("JWT_SECRET"),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  SESSION_SECRET: requireEnv("SESSION_SECRET"),

  /* ===============================
     ENGINE
  =============================== */
  ENGINE_URL: requireEnv("ENGINE_URL"),

  /* ===============================
     OAUTH
  =============================== */
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",

  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || "",
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || "",

  /* ===============================
     FRONTEND
  =============================== */
  FRONTEND_URL: requireEnv("FRONTEND_URL"),
};
