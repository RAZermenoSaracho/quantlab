import { z } from "zod";

/* =========================
   Algorithm Entity
========================= */

export const AlgorithmSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  name: z.string(),
  notes_html: z.string().nullable().optional(),
  code: z.string(),
  github_url: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Algorithm = z.infer<typeof AlgorithmSchema>;

/* =========================
   DTOs
========================= */

export const CreateAlgorithmSchema = z.object({
  name: z.string().min(1),
  notes_html: z.string().optional(),
  code: z.string().optional(),
  githubUrl: z.string().optional(),
});

export type CreateAlgorithmDto = z.infer<typeof CreateAlgorithmSchema>;

export const UpdateAlgorithmSchema = z.object({
  name: z.string().optional(),
  notes_html: z.string().optional(),
  code: z.string().optional(),
});

export type UpdateAlgorithmDto = z.infer<typeof UpdateAlgorithmSchema>;

/* =========================
   Responses
========================= */

export const AlgorithmsListResponseSchema = z.object({
  algorithms: z.array(AlgorithmSchema),
});

export type AlgorithmsListResponse = z.infer<
  typeof AlgorithmsListResponseSchema
>;