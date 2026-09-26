import Papa from 'papaparse';

import { toMinor } from '@shared/money';
import { MAX_IMPORT_ROWS } from '@shared/pricing';

import type { PriceImportRow } from '@shared/pricing';

/**
 * Reading a price-list CSV into import rows, before anything is sent.
 *
 * Only what the file *itself* can get wrong is checked here — a price that is not a number, a
 * date in the wrong shape. Whether a SKU exists, whether the unit is one the product declares,
 * whether a row overlaps a price already on file: those need the database, so the server's dry
 * run answers them, and the preview shows both kinds of problem side by side, per row.
 */

export const PRICE_CSV_COLUMNS = [
  { key: 'sku', required: true, note: 'Product SKU.' },
  { key: 'variantSku', required: false, note: 'A variant SKU, to price one variant only.' },
  {
    key: 'uom',
    required: false,
    note: "Unit — the product's base unit or a pack code. Default: base unit.",
  },
  { key: 'minQty', required: false, note: 'Qty break, in that unit. Default 1.' },
  { key: 'price', required: true, note: 'Per unit, in major units, e.g. 540.00' },
  { key: 'validFrom', required: false, note: 'YYYY-MM-DD. Blank: already in force.' },
  { key: 'validTo', required: false, note: 'YYYY-MM-DD. Blank: open-ended.' },
  { key: 'note', required: false, note: '' },
] as const;

export interface LocalRow {
  line: number;
  raw: Record<string, string>;
  /** Null when the row failed a local check and will not be sent. */
  row: PriceImportRow | null;
  errors: string[];
}

export interface ParsedFile {
  rows: LocalRow[];
  fatal: string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: string | undefined) => (v ?? '').trim();

export function parsePriceCsv(text: string): ParsedFile {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const missing = PRICE_CSV_COLUMNS.filter((c) => c.required && !headers.includes(c.key)).map(
    (c) => c.key,
  );
  if (missing.length > 0) {
    return {
      rows: [],
      fatal: [`Missing column(s): ${missing.join(', ')}. Download the template.`],
    };
  }
  if (parsed.data.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      fatal: [
        `${parsed.data.length} rows — the limit is ${MAX_IMPORT_ROWS} per file. Split it.`,
      ],
    };
  }

  const rows = parsed.data.map((raw, index): LocalRow => {
    // +2: the header is line 1, and spreadsheets count from 1.
    const line = index + 2;
    const errors: string[] = [];

    const sku = clean(raw.sku).toUpperCase();
    if (!sku) errors.push('sku is empty');

    const priceText = clean(raw.price).replace(/,/g, '');
    const price = Number(priceText);
    if (priceText === '' || !Number.isFinite(price) || price < 0) {
      errors.push(`price "${clean(raw.price)}" is not an amount`);
    }

    const minQtyText = clean(raw.minQty);
    const minQty = minQtyText === '' ? 1 : Number(minQtyText);
    if (!Number.isInteger(minQty) || minQty < 1) {
      errors.push(`minQty "${minQtyText}" must be a whole number of 1 or more`);
    }

    const validFrom = clean(raw.validFrom) || null;
    const validTo = clean(raw.validTo) || null;
    if (validFrom && !DATE.test(validFrom))
      errors.push(`validFrom "${validFrom}" is not YYYY-MM-DD`);
    if (validTo && !DATE.test(validTo)) errors.push(`validTo "${validTo}" is not YYYY-MM-DD`);

    if (errors.length > 0) return { line, raw, row: null, errors };

    return {
      line,
      raw,
      errors,
      row: {
        line,
        sku,
        variantSku: clean(raw.variantSku).toUpperCase() || null,
        uomCode: clean(raw.uom).toUpperCase() || null,
        minQty,
        priceMinor: toMinor(price),
        validFrom,
        validTo,
        note: clean(raw.note) || null,
      },
    };
  });

  return { rows, fatal: [] };
}

export function priceCsvTemplate(): string {
  const header = PRICE_CSV_COLUMNS.map((c) => c.key).join(',');
  const example = [
    'FRM-0001,,DOZ,1,540.00,,,',
    'FRM-0001,,DOZ,5,510.00,,,5 dozen and up',
    'LNS-CR39-SV,LNS-CR39-SV-M200,PAIR,1,180.00,2026-01-01,2026-12-31,',
  ];
  return [header, ...example].join('\n');
}
