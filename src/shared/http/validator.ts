import type { Context } from 'hono';
import { ValidationError } from '@/shared/errors';

export interface ParserSchema<T> {
  parse(input: unknown): T;
}

/**
 * Safely parse and validate HTTP JSON request body against a schema (Zod).
 * Throws ValidationError if JSON payload is missing or malformed.
 */
export async function parseBody<T>(c: Context, schema: ParserSchema<T>): Promise<T> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new ValidationError('Invalid or missing JSON body');
  }
  return schema.parse(json);
}

/**
 * Safely parse and validate URL path parameters against a schema (Zod).
 */
export function parseParam<T>(c: Context, schema: ParserSchema<T>): T {
  return schema.parse(c.req.param());
}

/**
 * Safely parse and validate query string parameters against a schema (Zod).
 * Automatically normalizes array query values to standard single strings.
 */
export function parseQuery<T>(c: Context, schema: ParserSchema<T>): T {
  const raw: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(c.req.query())) {
    raw[k] = Array.isArray(v) ? v[0] : (v as string);
  }
  return schema.parse(raw);
}

/**
 * Safely parse and validate HTTP request headers against a schema (Zod).
 */
export function parseHeader<T>(c: Context, schema: ParserSchema<T>): T {
  return schema.parse(c.req.header());
}
