import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
    const val = process.env[name];
    if (!val) throw new Error(`Missing required env var: ${name}`);
    return val;
}

export const env = {
    PORT: Number(process.env.PORT || 5000),
    DATABASE_URL: requireEnv("DATABASE_URL"),
    JWT_SECRET: requireEnv("JWT_SECRET"),
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
    ENGINE_URL: requireEnv("ENGINE_URL")
};
