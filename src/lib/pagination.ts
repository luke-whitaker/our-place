/**
 * Parse pagination params from a URL's search params.
 * Defaults: page=1, limit=30. Max limit=100.
 */
export function parsePagination(searchParams: URLSearchParams): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "30", 10) || 30));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Build pagination metadata for a response.
 * Fetch limit+1 rows from the DB, then slice to limit — the extra row tells you if there's more.
 */
export function paginateResults<T>(rows: T[], limit: number, page: number) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, hasMore, page };
}
