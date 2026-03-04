import { z } from "zod";

/* =========================
   Generic API Wrappers
========================= */

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z
    .object({
      success: z.literal(true),
      data: schema,
    })
    .strict();

export const ApiErrorSchema = z
  .object({
    success: z.literal(false),
    error: z
      .object({
        message: z.string(),
        details: z.unknown().optional(),
      })
      .strict(),
  })
  .strict();

export const ApiResponseSchema = <T extends z.ZodTypeAny>(schema: T) =>
  z.discriminatedUnion("success", [ApiSuccessSchema(schema), ApiErrorSchema]);

export type ApiError = z.infer<typeof ApiErrorSchema>;

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function isApiError<T>(x: ApiResponse<T>): x is ApiError {
  return x.success === false;
}

export function isApiSuccess<T>(x: ApiResponse<T>): x is ApiSuccess<T> {
  return x.success === true;
}