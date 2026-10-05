import { useCallback, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';

import { env } from '@/config/env';

import type { RefObject } from 'react';

/**
 * Printing at the counter (Day 20).
 *
 * Every printout is an ordinary React component rendered off-screen and handed to
 * `react-to-print`, which copies it into an iframe with the app's styles and opens the browser's
 * print dialog. The **paper** is a per-till setting (a till is a browser): thermal rolls come in
 * 80 mm and 58 mm, and the receipt reflows to fit. Set the thermal printer as the browser's
 * default printer and enable silent/kiosk printing on the till to skip the dialog.
 */

export type Paper = '80' | '58' | 'A4';

export interface PrintSettings {
  /** Roll width for receipts, return slips and the Z-report. */
  paper: '80' | '58';
  /** Print the receipt as soon as a sale completes, without pressing P. */
  autoPrint: boolean;
  /** One line at the foot of every receipt — returns policy, thanks, a hotline. */
  footer: string;
}

const KEY = 'pos-wholesale.print';
const DEFAULTS: PrintSettings = {
  paper: '80',
  autoPrint: false,
  footer: 'Thank you. Goods can be returned within 7 days with this receipt.',
};

export function loadPrintSettings(): PrintSettings {
  try {
    return {
      ...DEFAULTS,
      ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<PrintSettings>),
    };
  } catch {
    return DEFAULTS;
  }
}

export function savePrintSettings(s: PrintSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // A private window: the setting lasts for this page only.
  }
}

/** `@page` rules per paper — a thermal roll has no fixed height and no margins to speak of. */
export function pageStyle(paper: Paper): string {
  if (paper === 'A4') return '@page { size: A4; margin: 12mm } body { margin: 0 }';
  return `@page { size: ${paper}mm auto; margin: 0 } html, body { margin: 0; width: ${paper}mm }`;
}

/** Printable width in mm — a 80 mm roll prints about 72 mm wide, a 58 mm roll about 48 mm. */
export const printableWidth = (paper: '80' | '58') => (paper === '80' ? 72 : 48);

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: env.timezone,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? dateTime.format(new Date(iso)) : '—';

const dateOnly = new Intl.DateTimeFormat('en-GB', {
  timeZone: env.timezone,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
/**
 * The date alone, in the org's zone. A formatter of its own — never `fmtDateTime(..).slice()`:
 * en-GB spells September "Sept", so a fixed-width cut takes the year with it.
 */
export const fmtDate = (iso: string | null | undefined) =>
  iso ? dateOnly.format(new Date(iso)) : '—';

export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  MFS: 'bKash/Nagad',
  BANK: 'Bank',
  CHEQUE: 'Cheque',
  ADJUSTMENT: 'Exchange',
  EXCHANGE: 'Exchange',
};

/**
 * The function that prints the document behind `ref`. The ref is the caller's own `useRef`,
 * attached to the document element — kept apart from this hook's return value so reading the
 * print function during render never looks like reading a ref.
 */
export function usePrint(ref: RefObject<HTMLDivElement | null>, paper: Paper, title: string) {
  // Printing focuses the print iframe, which is then removed — leaving focus nowhere, so the next
  // Enter at the till would do nothing. Put it back where it was.
  const back = useRef<HTMLElement | null>(null);
  const print = useReactToPrint({
    contentRef: ref,
    documentTitle: title,
    pageStyle: pageStyle(paper),
    onAfterPrint: () => {
      back.current?.focus();
      back.current = null;
    },
  });
  return useCallback(() => {
    back.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    print();
  }, [print]);
}
