import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// ─── Success Response ─────────────────────────────────────────────────────────

export interface SuccessResponse<T> {
  data: T;
}

// ─── Error Response ───────────────────────────────────────────────────────────

export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    request_id?: string;
    details?: unknown;
  };
}

// ─── Cursor Pagination Response ───────────────────────────────────────────────

export interface CursorPaginationMeta {
  /** Cursor untuk halaman selanjutnya. null berarti tidak ada halaman berikutnya. */
  next_cursor: string | null;
  /** Cursor untuk halaman sebelumnya. null berarti ini halaman pertama. */
  prev_cursor: string | null;
  /** Jumlah item dalam response saat ini. */
  count: number;
  /** Jumlah item per halaman yang diminta. */
  limit: number;
  /** Apakah masih ada halaman setelahnya. */
  has_more: boolean;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  pagination: CursorPaginationMeta;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function sendSuccess<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json<SuccessResponse<T>>({ data }, status);
}

export function sendError(
  c: Context,
  code: string,
  message: string,
  status: ContentfulStatusCode = 500,
  details?: unknown
) {
  const requestId = c.get('requestId') as string | undefined;
  const payload: ErrorResponseBody = {
    error: {
      code,
      message,
      ...(requestId ? { request_id: requestId } : {}),
      ...(details ? { details } : {}),
    },
  };
  return c.json(payload, status);
}

/**
 * Kirim response cursor-paginated.
 *
 * @param c        - Hono context
 * @param items    - Array item yang dikembalikan (termasuk 1 item extra bila ada more)
 * @param limit    - Jumlah item per halaman yang diminta
 * @param cursorFn - Fungsi untuk mengekstrak cursor string dari 1 item
 * @param prevCursor - Cursor yang dipakai untuk minta halaman ini (jika ada)
 */
export function sendCursorPaginated<T extends object>(
  c: Context,
  items: T[],
  limit: number,
  cursorFn: (item: T) => string,
  prevCursor?: string | null
) {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;

  const lastItem = data[data.length - 1];
  const nextCursor = hasMore && lastItem ? cursorFn(lastItem) : null;

  const pagination: CursorPaginationMeta = {
    next_cursor: nextCursor,
    prev_cursor: prevCursor ?? null,
    count: data.length,
    limit,
    has_more: hasMore,
  };

  return c.json<CursorPaginatedResponse<T>>({ data, pagination }, 200);
}
