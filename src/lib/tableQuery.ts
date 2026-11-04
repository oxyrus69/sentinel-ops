/**
 * Whitelist validation for every URL searchParams that reaches a Drizzle query.
 *
 * Rule: never interpolate a raw searchParam into a query. Sort columns, filter
 * values, page and size are all validated here first.
 */

export interface TableQuery {
  page: number;
  size: number;
  sort: string | null;
  dir: 'asc' | 'desc';
  q: string;
  filters: Record<string, string>;
}

export interface TableQueryConfig {
  /** Columns that may be sorted. Anything else falls back to defaultSort. */
  sortable: readonly string[];
  defaultSort: string;
  defaultDir?: 'asc' | 'desc';
  /** Filter keys that are accepted, mapped to allowed values or 'free'. */
  filters?: Record<string, readonly string[] | 'free'>;
  defaultPageSize?: number;
  maxPageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Parse + validate. Always returns a usable query; bad input is dropped. */
export function parseTableQuery(
  searchParams: URLSearchParams | Record<string, string | string[] | undefined>,
  config: TableQueryConfig,
): TableQuery {
  const get = (key: string): string | null => {
    if (searchParams instanceof URLSearchParams) return searchParams.get(key);
    const v = searchParams[key];
    if (Array.isArray(v)) return v[0] ?? null;
    return typeof v === 'string' ? v : null;
  };

  const defaultDir = config.defaultDir ?? 'asc';
  const maxPageSize = config.maxPageSize ?? MAX_PAGE_SIZE;
  const defaultPageSize = config.defaultPageSize ?? DEFAULT_PAGE_SIZE;

  // --- page ---
  let page = toPositiveInt(get('page'), 1);
  if (page < 1) page = 1;

  // --- size ---
  let size = toPositiveInt(get('size'), defaultPageSize);
  if (size < 1) size = defaultPageSize;
  if (size > maxPageSize) size = maxPageSize;

  // --- sort / dir ---
  const rawSort = sanitizeToken(get('sort'));
  const sort = rawSort && config.sortable.includes(rawSort) ? rawSort : config.defaultSort;
  const rawDir = (get('dir') ?? '').toLowerCase();
  const dir = rawDir === 'desc' ? 'desc' : defaultDir;

  // --- q ---
  const q = sanitizeText(get('q'), 120);

  // --- filters ---
  const filters: Record<string, string> = {};
  if (config.filters) {
    for (const [key, allowed] of Object.entries(config.filters)) {
      const raw = get(key);
      if (raw === null || raw === '') continue;
      if (allowed === 'free') {
        const cleaned = sanitizeText(raw, 200);
        if (cleaned) filters[key] = cleaned;
        continue;
      }
      const normalized = raw.toUpperCase();
      if (allowed.includes(normalized)) filters[key] = normalized;
    }
  }

  return { page, size, sort, dir, q, filters };
}

/** SQL LIKE pattern for a user query, with wildcards escaped. */
export function toLikePattern(q: string): string {
  const escaped = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

/** Strip characters that could break out of an identifier or LIKE clause. */
export function sanitizeToken(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_]/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

export function sanitizeText(value: string | null, maxLength: number): string {
  if (!value) return '';
  // Drop control characters, collapse whitespace, cap length.
  const cleaned = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxLength);
}

function toPositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

/** Build a stable, URL-safe representation for pagination links. */
export function queryToSearchParams(query: TableQuery): string {
  const params = new URLSearchParams();
  if (query.page > 1) params.set('page', String(query.page));
  if (query.size !== DEFAULT_PAGE_SIZE) params.set('size', String(query.size));
  params.set('sort', query.sort ?? '');
  params.set('dir', query.dir);
  if (query.q) params.set('q', query.q);
  for (const [k, v] of Object.entries(query.filters)) params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : '';
}
