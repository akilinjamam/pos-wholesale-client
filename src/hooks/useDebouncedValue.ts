import { useEffect, useState } from 'react';

/**
 * A value that settles before it is used.
 *
 * Every list screen's search box feeds a query key. Without this, typing "acetate" fires seven
 * requests, six of which are stale before they land — and because the server's search runs a
 * `$text` query, six of them are real index scans on a growing collection.
 *
 * Deliberately a *value* hook rather than a debounced callback: the search term also drives the
 * empty state ("no results for X") and the page reset, and those must agree with what was
 * actually asked for, not with what is currently in the input.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
