'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
} from 'lucide-react';
import {
  createPaginatedRowModel,
  createSortedRowModel,
  flexRender,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type PaginationState,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { cn } from '@/lib/cn';
import { TABLE_SORT_FN_NAME, tableSortFn } from '@/lib/tableSort';
import { Button } from '@/components/ui/button';
import { Table, TableWrap, TBody, TD, THead, TH, TR } from '@/components/ui/table';

/**
 * Interactive data table.
 *
 * Sorting and pagination run on the client, on top of the row set the server
 * already filtered through the URL. That split is deliberate: filters belong in
 * the URL so a view is shareable and survives a refresh, while column order and
 * page position are view state a user changes constantly and should not cost a
 * server round trip.
 *
 * Callers describe rows with a plain column list, so no table-library generics
 * leak into page code, and the same row data also feeds the mobile card layout.
 */

/** Declared once, outside render, so the feature type stays stable. */
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { [TABLE_SORT_FN_NAME]: tableSortFn },
});

export interface DataTableColumn<T> {
  /** Stable id, also the sort key. */
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /**
   * Value to sort by. Omit to make the column unsortable — better than sorting
   * on rendered markup, which would order "10 hari" before "9 hari".
   */
  sortValue?: (row: T) => string | number | null;
  /** Right-align and use tabular figures. */
  numeric?: boolean;
  /**
   * Sort largest-first on the first click. Numeric columns default to `true`
   * (TanStack's choice), but for a risk indicator the smallest value is the one
   * worth seeing first, so callers can override it.
   */
  sortDescFirst?: boolean;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T extends RowData> {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  getRowId: (row: T) => string;
  /** Rendered below the table on narrow screens, one card per row. */
  mobileCard: (row: T) => ReactNode;
  /** Column sorted on first render. */
  initialSort?: { columnId: string; desc?: boolean };
  pageSize?: number;
  emptyMessage: string;
  /** Noun used in the count line, e.g. "aset". */
  countLabel?: string;
}

function sortIcon(direction: false | 'asc' | 'desc') {
  if (direction === 'asc') return <ArrowUp aria-hidden="true" className="h-3 w-3" />;
  if (direction === 'desc') return <ArrowDown aria-hidden="true" className="h-3 w-3" />;
  return <ChevronsUpDown aria-hidden="true" className="h-3 w-3 opacity-50" />;
}

export function DataTable<T extends RowData>({
  columns: spec,
  rows,
  getRowId,
  mobileCard,
  initialSort,
  pageSize = 20,
  emptyMessage,
  countLabel,
}: DataTableProps<T>) {
  // Column presentation is looked up from the caller's spec by id rather than
  // through the library's `meta` slot, which would need module augmentation.
  const byId = useMemo(() => {
    const map = new Map<string, DataTableColumn<T>>();
    for (const column of spec) map.set(column.id, column);
    return map;
  }, [spec]);

  const columns = useMemo<Array<ColumnDef<typeof features, T>>>(
    () =>
      spec.map((column) => ({
        id: column.id,
        header: column.header,
        // Sort on the nominated value, not the rendered cell.
        accessorFn: (row: T) => column.sortValue?.(row) ?? null,
        enableSorting: Boolean(column.sortValue),
        sortFn: TABLE_SORT_FN_NAME,
        sortDescFirst: column.sortDescFirst ?? column.numeric ?? false,
        cell: (context) => column.cell(context.row.original),
      })),
    [spec],
  );

  const [sorting, setSorting] = useState<SortingState>(
    initialSort ? [{ id: initialSort.columnId, desc: Boolean(initialSort.desc) }] : [],
  );
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    autoResetPageIndex: true,
  });

  const pageRows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const from = pagination.pageIndex * pagination.pageSize;

  return (
    <>
      {/* Desktop: a real table, sorted through its headers. */}
      <div className="hidden md:block">
        <TableWrap>
          <Table>
            <THead>
              <TR>
                {table.getHeaderGroups().map((headerGroup) =>
                  headerGroup.headers.map((header) => {
                    const meta = byId.get(header.column.id);
                    const canSort = header.column.getCanSort();
                    const direction = header.column.getIsSorted();
                    const label = flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    );
                    return (
                      <TH
                        key={header.id}
                        className={cn(meta?.numeric && 'text-right', meta?.headerClassName)}
                        aria-sort={
                          direction === 'asc'
                            ? 'ascending'
                            : direction === 'desc'
                              ? 'descending'
                              : undefined
                        }
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex cursor-pointer items-center gap-1 text-inherit transition-colors duration-fast hover:text-text-primary"
                            title={`Urutkan menurut ${String(header.column.columnDef.header)}`}
                          >
                            {label}
                            {sortIcon(direction)}
                          </button>
                        ) : (
                          label
                        )}
                      </TH>
                    );
                  }),
                )}
              </TR>
            </THead>
            <TBody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={spec.length}
                    className="px-3 py-10 text-center text-[13px] text-text-muted"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <TR key={row.id}>
                    {row.getAllCells().map((cell) => {
                      const meta = byId.get(cell.column.id);
                      return (
                        <TD
                          key={cell.id}
                          className={cn(meta?.numeric && 'numeric text-right', meta?.className)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TD>
                      );
                    })}
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableWrap>
      </div>

      {/* Mobile: the same rows as cards, sorted and paged identically. */}
      <div className="space-y-2 md:hidden">
        {pageRows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-muted">{emptyMessage}</p>
        ) : (
          pageRows.map((row) => <div key={row.id}>{mobileCard(row.original)}</div>)
        )}
      </div>

      {/* Count and pagination. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-text-muted" aria-live="polite">
          {rows.length === 0 ? (
            <>Tidak ada {countLabel ?? 'baris'}</>
          ) : (
            <>
              Menampilkan{' '}
              <span className="numeric text-text-primary">
                {from + 1}–{Math.min(from + pagination.pageSize, rows.length)}
              </span>{' '}
              dari <span className="numeric text-text-primary">{rows.length}</span>
              {countLabel ? ` ${countLabel}` : ''}
            </>
          )}
        </p>

        {pageCount > 1 ? (
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="iconSm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
            <span className="numeric px-1 text-[12px] text-text-secondary">
              {pagination.pageIndex + 1} / {pageCount}
            </span>
            <Button
              variant="secondary"
              size="iconSm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Halaman berikutnya"
            >
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
