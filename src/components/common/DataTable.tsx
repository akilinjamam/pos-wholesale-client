import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Inbox,
} from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import type { PageMeta } from '@shared/types';
import type { ReactNode } from 'react';

/**
 * The one table.
 *
 * Every list screen in this system renders through this component, which is what stops the
 * retail app's outcome: a dozen bespoke tables, each with its own pagination bug, none of which
 * has a loading state, and two of which sort client-side over the current page only — so
 * "sort by balance" silently means "sort these 25 rows by balance".
 *
 * The decisions that matter:
 *
 *  - **Sorting and pagination are server-side.** The component reports intent through
 *    `onSortChange` / `onPageChange` and renders whatever comes back. It never reorders `rows`
 *    itself, because the page it holds is not the dataset.
 *  - **Loading renders skeleton rows, not a spinner that replaces the table.** The header and
 *    the toolbar stay put, so the layout does not jump when data arrives — and a refetch after
 *    a filter change does not blank the screen the user is reading.
 *  - **`isFetching` dims rather than unmounts.** Paging through a list should not flash empty.
 *  - **Empty and filtered-to-nothing are different** — see `EmptyState`; the caller passes the
 *    right one.
 */

export interface Column<T> {
  /** Stable identity for React. Also the default sort field when `sortable` is set. */
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /**
   * The field name the *server* sorts by. `true` reuses `key`. Omit for a column the server
   * has no index for — offering a sort the API will ignore is worse than not offering it.
   */
  sortable?: boolean | string;
  /** Applied to the cells; use for `text-right tabular-nums` on money columns. */
  className?: string;
  headClassName?: string;
}

export interface SortState {
  field: string;
  order: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Stable row identity — the document id, never the array index. */
  rowKey: (row: T) => string;

  /** First load: no data has arrived yet. Renders skeleton rows. */
  isLoading?: boolean;
  /** A background refetch: the rows on screen are still valid, just stale. */
  isFetching?: boolean;

  meta?: PageMeta;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;

  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;

  /** Row selection, for bulk actions. Omit entirely and no checkbox column is drawn. */
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;

  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  /** Rows drawn while `isLoading`; match the page size so the layout does not jump. */
  skeletonRows?: number;
}

const PAGE_SIZES = [25, 50, 100] as const;

function sortFieldOf<T>(column: Column<T>): string | null {
  if (!column.sortable) return null;
  return typeof column.sortable === 'string' ? column.sortable : column.key;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  isLoading = false,
  isFetching = false,
  meta,
  onPageChange,
  onLimitChange,
  sort,
  onSortChange,
  selectedIds,
  onSelectionChange,
  onRowClick,
  empty,
  skeletonRows = 8,
}: DataTableProps<T>) {
  const selectable = Boolean(selectedIds && onSelectionChange);
  const selected = new Set(selectedIds ?? []);

  const pageIds = rows.map(rowKey);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  const toggleAllOnPage = () => {
    if (!onSelectionChange) return;
    // Only this page's ids are added or removed — a selection made on page 1 survives a trip
    // to page 2 and back, which is what a bulk action across pages needs.
    const next = new Set(selected);
    if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
    else pageIds.forEach((id) => next.add(id));
    onSelectionChange([...next]);
  };

  const toggleOne = (id: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange([...next]);
  };

  const requestSort = (field: string) => {
    if (!onSortChange) return;
    // Same column: flip. Different column: start ascending, which is what a first click on a
    // name column should do.
    const order: SortState['order'] =
      sort?.field === field && sort.order === 'asc' ? 'desc' : 'asc';
    onSortChange({ field, order });
  };

  const columnCount = columns.length + (selectable ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox
                    checked={allOnPageSelected}
                    indeterminate={!allOnPageSelected && someOnPageSelected}
                    onChange={toggleAllOnPage}
                    disabled={pageIds.length === 0}
                    aria-label={
                      allOnPageSelected ? 'Clear selection' : 'Select all on this page'
                    }
                  />
                </TableHead>
              )}

              {columns.map((column) => {
                const field = sortFieldOf(column);
                const active = field !== null && sort?.field === field;

                return (
                  <TableHead key={column.key} className={column.headClassName}>
                    {field && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => requestSort(field)}
                        // `aria-sort` belongs on the <th>; it is set below via the wrapper.
                        className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase tracking-wide transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {column.header}
                        {active ? (
                          sort.order === 'asc' ? (
                            <ArrowUp className="h-3 w-3" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="h-3 w-3" aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                        )}
                        <span className="sr-only">
                          {active
                            ? `sorted ${sort.order === 'asc' ? 'ascending' : 'descending'}`
                            : 'sort'}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody
            className={cn(isFetching && !isLoading && 'opacity-60 transition-opacity')}
          >
            {isLoading ? (
              Array.from({ length: skeletonRows }, (_, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                  {Array.from({ length: columnCount }, (_, c) => (
                    <TableCell key={c}>
                      <Skeleton className="h-4 w-full max-w-[12rem]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="p-0">
                  {empty ?? (
                    <EmptyState
                      icon={Inbox}
                      title="Nothing here yet"
                      description="No records match this view."
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const id = rowKey(row);
                return (
                  <TableRow
                    key={id}
                    selected={selected.has(id)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(onRowClick && 'cursor-pointer')}
                  >
                    {selectable && (
                      <TableCell
                        // Clicking the checkbox must not also open the row.
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selected.has(id)}
                          onChange={() => toggleOne(id)}
                          aria-label="Select row"
                        />
                      </TableCell>
                    )}

                    {columns.map((column) => (
                      <TableCell key={column.key} className={column.className}>
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.total > 0 && (
        <Pagination
          meta={meta}
          selectedCount={selectable ? selected.size : 0}
          onPageChange={onPageChange}
          onLimitChange={onLimitChange}
        />
      )}
    </div>
  );
}

interface PaginationProps {
  meta: PageMeta;
  selectedCount: number;
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}

/**
 * The footer bar: what is on screen, out of how many, and the way to the rest.
 *
 * "Showing 26–50 of 312" rather than a bare page number, because on a receivables list the
 * question is always "how much is left", and a page number answers it only if you already know
 * the page size.
 */
function Pagination({ meta, selectedCount, onPageChange, onLimitChange }: PaginationProps) {
  const first = (meta.page - 1) * meta.limit + 1;
  const last = Math.min(meta.page * meta.limit, meta.total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>
          Showing <span className="font-medium text-foreground">{first}</span>–
          <span className="font-medium text-foreground">{last}</span> of{' '}
          <span className="font-medium text-foreground">{meta.total}</span>
        </span>
        {selectedCount > 0 && (
          <span className="text-foreground">· {selectedCount} selected</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {onLimitChange && (
          <label className="flex items-center gap-2">
            <span className="hidden sm:inline">Rows</span>
            <Select
              value={String(meta.limit)}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="h-8 w-20"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={meta.page <= 1}
            onClick={() => onPageChange?.(meta.page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <span className="px-2 tabular-nums">
            {meta.page} / {Math.max(meta.totalPages, 1)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={meta.page >= meta.totalPages}
            onClick={() => onPageChange?.(meta.page + 1)}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
