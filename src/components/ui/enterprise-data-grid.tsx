'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Download,
  Rows2,
  Rows3,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

/**
 * EnterpriseDataGrid (Global Dashboard Design §4.2).
 *
 * One container that owns the whole table experience: search, faceted status
 * chips with live counts, density switch, sortable headers, row selection with
 * a floating bulk-action bar, and a summary/pagination footer.
 *
 * Sorting, filtering and paging run on the client over the row set the server
 * already authorised. That split keeps a view shareable through the URL while
 * column order and page position cost nothing.
 */

export interface GridColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Sort key. Omit to make the column unsortable. */
  sortValue?: (row: T) => string | number | null;
  /** Right-align with tabular figures (money, counts, IDs-as-numbers). */
  numeric?: boolean;
  sortDescFirst?: boolean;
  className?: string;
  headerClassName?: string;
  /** Hide on narrow screens; the mobile card still carries the value. */
  hideOnMobile?: boolean;
}

export interface EnterpriseDataGridProps<T> {
  columns: Array<GridColumn<T>>;
  rows: T[];
  /** Optional facets; the first entry is always "Semua". */
  facets?: Array<{
    id: string;
    label: string;
    match: (row: T) => boolean;
    tone?: 'neutral' | 'critical' | 'warning' | 'healthy' | 'info';
  }>;
  /** Free-text search fields. */
  searchFields?: Array<(row: T) => string | null | undefined>;
  searchPlaceholder?: string;
  bulkActions?: Array<{ label: string; onRun: (ids: string[]) => void }>;
  /** Rendered instead of the table on narrow screens. */
  mobileCard: (row: T) => ReactNode;
  initialSort?: { columnId: string; desc?: boolean };
  pageSize?: number;
  /** Noun for the count line, e.g. "aset". */
  countLabel: string;
  emptyMessage: string;
  toolbarExtra?: ReactNode;
  /** Stable id extractor; required since rows carry their own shape. */
  getRowId: (row: T) => string;
}

const FACET_TONE: Record<string, string> = {
  neutral: 'data-[on=true]:border-border-strong data-[on=true]:bg-surface-raised data-[on=true]:text-text-primary',
  critical: 'data-[on=true]:border-status-critical/50 data-[on=true]:bg-status-critical/15 data-[on=true]:text-status-critical',
  warning: 'data-[on=true]:border-status-warning/50 data-[on=true]:bg-status-warning/15 data-[on=true]:text-status-warning',
  healthy: 'data-[on=true]:border-status-healthy/50 data-[on=true]:bg-status-healthy/15 data-[on=true]:text-status-healthy',
  info: 'data-[on=true]:border-status-info/50 data-[on=true]:bg-status-info/15 data-[on=true]:text-status-info',
};

const TONE_DOT: Record<string, string> = {
  critical: 'bg-status-critical',
  warning: 'bg-status-warning',
  healthy: 'bg-status-healthy',
  info: 'bg-status-info',
  neutral: 'bg-status-neutral',
};

export function EnterpriseDataGrid<T>({
  columns,
  rows,
  facets = [],
  searchFields = [],
  searchPlaceholder = 'Cari…',
  bulkActions = [],
  mobileCard,
  initialSort,
  pageSize: initialPageSize = 20,
  countLabel,
  emptyMessage,
  toolbarExtra,
  getRowId,
}: EnterpriseDataGridProps<T>) {
  const [query, setQuery] = useState('');
  const [facet, setFacet] = useState<string | null>(null);
  const [density, setDensity] = useState<'compact' | 'standard'>('standard');
  const [sort, setSort] = useState<{ id: string; desc: boolean } | null>(
    initialSort ? { id: initialSort.columnId, desc: Boolean(initialSort.desc) } : null,
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const activeFacet = facets.find((f) => f.id === facet) ?? null;

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (activeFacet) out = out.filter((r) => activeFacet.match(r));
    if (q) {
      out = out.filter((row) =>
        searchFields.some((field) => (field(row) ?? '').toLowerCase().includes(q)),
      );
    }
    return out;
  }, [rows, query, activeFacet, searchFields]);

  const sorted = useMemo(() => {
    if (!sort) return searched;
    const column = columns.find((c) => c.id === sort.id);
    if (!column?.sortValue) return searched;
    const dir = sort.desc ? -1 : 1;
    return [...searched].sort((a, b) => compare(column.sortValue!(a), column.sortValue!(b)) * dir);
  }, [searched, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(pageIndex, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const from = safePage * pageSize;

  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(getRowId(r)));

  function toggleSort(columnId: string) {
    const column = columns.find((c) => c.id === columnId);
    if (!column?.sortValue) return;
    setSort((prev) => {
      if (prev?.id !== columnId) {
        return { id: columnId, desc: column.sortDescFirst ?? column.numeric ?? false };
      }
      if (!prev.desc && !(column.sortDescFirst ?? false)) return { id: columnId, desc: true };
      if (prev.desc) return null;
      return { id: columnId, desc: true };
    });
    setPageIndex(0);
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) for (const r of pageRows) next.delete(getRowId(r));
      else for (const r of pageRows) next.add(getRowId(r));
      return next;
    });
  }

  const cellPad = density === 'compact' ? 'py-1.5' : 'py-2.5';

  return (
    <div className="relative rounded-md border border-border-subtle bg-surface-raised">
      {/* ---- Toolbar (L2 inset well) ---- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-sunken/70 px-3 py-2">
        {searchFields.length > 0 ? (
          <div className="relative min-w-0 flex-1 basis-full sm:basis-64">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPageIndex(0);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 w-full rounded-sm border border-border-subtle bg-surface-base pl-8 pr-7 text-[12.5px] text-text-primary placeholder:text-text-muted transition-colors duration-fast focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Bersihkan pencarian"
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-text-muted hover:text-text-primary"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Facet chips with counts */}
        {facets.length > 0 ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1" role="group" aria-label="Filter status">
            <FacetChip
              label="Semua"
              count={rows.length}
              on={facet === null}
              onClick={() => {
                setFacet(null);
                setPageIndex(0);
              }}
              tone="neutral"
            />
            {facets.map((f) => {
              const count = rows.filter((r) => f.match(r)).length;
              if (count === 0 && facet !== f.id) return null;
              return (
                <FacetChip
                  key={f.id}
                  label={f.label}
                  count={count}
                  on={facet === f.id}
                  tone={f.tone ?? 'neutral'}
                  onClick={() => {
                    setFacet((prev) => (prev === f.id ? null : f.id));
                    setPageIndex(0);
                  }}
                />
              );
            })}
          </div>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {toolbarExtra}
          {/* Density */}
          <div
            role="group"
            aria-label="Kerapatan baris"
            className="flex items-center gap-px rounded-sm border border-border-subtle bg-surface-base p-px"
          >
            <button
              type="button"
              onClick={() => setDensity('compact')}
              aria-pressed={density === 'compact'}
              title="Rapat"
              className={cn(
                'flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm transition-colors duration-fast',
                density === 'compact'
                  ? 'bg-surface-raised text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              )}
            >
              <Rows3 aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only">Rapat</span>
            </button>
            <button
              type="button"
              onClick={() => setDensity('standard')}
              aria-pressed={density === 'standard'}
              title="Standar"
              className={cn(
                'flex h-6 w-6 cursor-pointer items-center justify-center rounded-sm transition-colors duration-fast',
                density === 'standard'
                  ? 'bg-surface-raised text-text-primary'
                  : 'text-text-muted hover:text-text-secondary',
              )}
            >
              <Rows2 aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only">Standar</span>
            </button>
          </div>
        </div>
      </div>

      {/* ---- Desktop table ---- */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-sunken/90">
              {bulkActions.length > 0 ? (
                <th scope="col" className="w-8 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={togglePage}
                    aria-label="Pilih semua baris di halaman ini"
                    className="h-3.5 w-3.5 cursor-pointer rounded-sm border border-border-strong bg-surface-base accent-accent"
                  />
                </th>
              ) : null}
              {columns.map((column) => {
                const canSort = Boolean(column.sortValue);
                const dir = sort?.id === column.id ? (sort.desc ? 'desc' : 'asc') : false;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                    className={cn(
                      'whitespace-nowrap px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-text-muted',
                      column.numeric && 'text-right',
                      column.hideOnMobile && 'hidden xl:table-cell',
                      column.headerClassName,
                    )}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className={cn(
                          'inline-flex cursor-pointer items-center gap-1 uppercase tracking-wider transition-colors duration-fast hover:text-text-secondary',
                          dir && 'text-text-primary',
                        )}
                        title={`Urutkan menurut ${column.header}`}
                      >
                        {column.header}
                        {sortIcon(dir)}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (bulkActions.length > 0 ? 1 : 0)}
                  className="px-3 py-12 text-center text-[13px] text-text-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const rowId = getRowId(row);
                const isSelected = selected.has(rowId);
                return (
                  <tr
                    key={rowId}
                    className={cn(
                      'group/row transition-colors duration-fast',
                      isSelected ? 'bg-accent-subtle/40' : 'hover:bg-surface-sunken/60',
                    )}
                  >
                    {bulkActions.length > 0 ? (
                      <td className="w-8 px-2 py-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(rowId)}
                          aria-label={`Pilih baris ini`}
                          className="h-3.5 w-3.5 cursor-pointer rounded-sm border border-border-strong bg-surface-base accent-accent"
                        />
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          'px-3 align-middle text-text-primary',
                          cellPad,
                          column.numeric && 'numeric text-right',
                          column.hideOnMobile && 'hidden xl:table-cell',
                          column.className,
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ---- Mobile cards ---- */}
      <div className="space-y-2 p-2.5 md:hidden">
        {pageRows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-muted">{emptyMessage}</p>
        ) : (
          pageRows.map((row) => <div key={getRowId(row)}>{mobileCard(row)}</div>)
        )}
      </div>

      {/* ---- Footer: range, aggregate, page size, pager ---- */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-3 py-2">
        <p className="text-[11.5px] text-text-muted" aria-live="polite">
          {sorted.length === 0 ? (
            <>Tidak ada {countLabel}</>
          ) : (
            <>
              Menampilkan{' '}
              <span className="numeric text-text-primary">
                {from + 1}–{Math.min(from + pageSize, sorted.length)}
              </span>{' '}
              dari <span className="numeric text-text-primary">{sorted.length}</span> {countLabel}
              {sorted.length !== rows.length ? (
                <span className="ml-1 text-text-muted">(dari {rows.length} total)</span>
              ) : null}
            </>
          )}
        </p>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11.5px] text-text-muted">
            <span className="hidden sm:inline">Baris</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPageIndex(0);
              }}
              className="h-7 cursor-pointer rounded-sm border border-border-subtle bg-surface-sunken px-1.5 text-[11.5px] text-text-primary focus:border-accent focus:outline-none"
            >
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="iconSm"
              onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
            <span className="numeric px-1 text-[11.5px] text-text-secondary">
              {safePage + 1} / {pageCount}
            </span>
            <Button
              variant="secondary"
              size="iconSm"
              onClick={() => setPageIndex((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label="Halaman berikutnya"
            >
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ---- Floating bulk-action bar ---- */}
      {bulkActions.length > 0 && selected.size > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-md border border-border-strong bg-surface-overlay px-3 py-2 shadow-[0_8px_24px_rgb(0_0_0_/_0.5)]">
            <span className="numeric text-[12.5px] text-text-primary">{selected.size} dipilih</span>
            {bulkActions.map((action) => (
              <Button
                key={action.label}
                variant="secondary"
                size="sm"
                onClick={() => {
                  action.onRun([...selected]);
                  setSelected(new Set());
                }}
              >
                <Download aria-hidden="true" className="h-3 w-3" />
                {action.label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Batalkan
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FacetChip({
  label,
  count,
  on,
  tone,
  onClick,
}: {
  label: string;
  count: number;
  on: boolean;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-on={on}
      aria-pressed={on}
      className={cn(
        'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-sm border border-border-subtle px-2 text-[11.5px] text-text-secondary transition-colors duration-fast hover:border-border-strong hover:text-text-primary',
        FACET_TONE[tone],
      )}
    >
      {tone !== 'neutral' ? (
        <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} />
      ) : null}
      {label}
      <span className="numeric text-[10.5px] opacity-80">{count}</span>
    </button>
  );
}

function sortIcon(direction: false | 'asc' | 'desc') {
  if (direction === 'asc') return <ArrowUp aria-hidden="true" className="h-3 w-3" />;
  if (direction === 'desc') return <ArrowDown aria-hidden="true" className="h-3 w-3" />;
  return <ChevronsUpDown aria-hidden="true" className="h-3 w-3 opacity-40" />;
}

/** Natural compare: numbers numeric, strings locale-aware, nulls last. */
function compare(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' });
}
