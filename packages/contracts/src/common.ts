import { z } from "zod";

/* =========================
   Generic API Wrappers
========================= */

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({
    success: z.literal(true),
    data: schema,
  });

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;