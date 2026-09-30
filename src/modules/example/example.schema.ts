import { z } from 'zod';

// ─── Body Schemas ─────────────────────────────────────────────────────────────

export const createExampleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  category_id: z.string().uuid('category_id must be a valid UUID').optional(),
});

export const updateExampleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  category_id: z.string().uuid().optional(),
});

// ─── Param Schemas ────────────────────────────────────────────────────────────

export const exampleIdParamSchema = z.object({
  id: z.string().uuid('Invalid ID format'),
});

// ─── Query Schemas ────────────────────────────────────────────────────────────

export const exampleListQuerySchema = z.object({
  cursor: z.string().uuid('cursor must be a valid UUID').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive']).optional(),
});
