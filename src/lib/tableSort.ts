import { constructSortFn } from '@tanstack/table-core';

/**
 * Comparator used by every sortable column in `DataTable`.
 *
 * The library's `alphanumeric` sort is designed for strings like "item2" before
 * "item10": it splits a value into alternating text and digit chunks. That is
 * wrong for signed numbers, because the minus sign becomes its own text chunk
 * and is then ignored — so "-19 days" sorts *after* "-2 days" and a queue of
 * overdue tickets comes out least-urgent-first, which is exactly backwards.
 *
 * This comparator decides per value pair instead:
 *   - two numbers compare numerically, sign included;
 *   - anything else compares as natural text, so "Vol 2" precedes "Vol 10";
 *   - missing values sink in ascending order.
 *
 * Kept in a plain module (no React, no 'use client') so it can be unit tested
 * directly — the bug above shipped once because it could not be.
 */
export const tableSortFn = constructSortFn({
  sort: (a, b) => {
    const aMissing = a === null || a === undefined || a === '';
    const bMissing = b === null || b === undefined || b === '';
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;

    if (typeof a === 'number' && typeof b === 'number') {
      if (a === b) return 0;
      // Explicit comparison, so Infinity (a row with no deadline) cannot
      // produce NaN the way `a - b` would.
      return a < b ? -1 : 1;
    }

    return String(a).localeCompare(String(b), 'id', {
      numeric: true,
      sensitivity: 'base',
    });
  },
});

/** Registered name of the comparator inside the table's feature set. */
export const TABLE_SORT_FN_NAME = 'auto';
