// packages/contracts/src/auth.ts
import { z } from "zod";

/* =========================
   REQUESTS
========================= */

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/* =========================
   DOMAIN
========================= */

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string().nullable().optional(),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

/* =========================
   RESPONSES
========================= */

export const AuthResponseSchema = z.object({
  user: AuthUserSchema,
  token: z.string(),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const MeResponseSchema = z.object({
  user: AuthUserSchema,
});

export type MeResponse = z.infer<typeof MeResponseSchema>;

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/);

export const UsernameAvailabilityResponseSchema = z.object({
  username: z.string(),
  valid: z.boolean(),
  available: z.boolean(),
});

export type UsernameAvailabilityResponse = z.infer<
  typeof UsernameAvailabilityResponseSchema
>;
