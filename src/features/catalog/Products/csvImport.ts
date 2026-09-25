import Papa from 'papaparse';

import { productAttrsSchema } from '@shared/catalog';
import { BASE_UOMS, PRODUCT_TYPES, TRACKING_MODES } from '@shared/enums';
import { toMinor } from '@shared/money';
import { validatePacks } from '@shared/uom';

import type { CreateProductBody } from '@/api/endpoints/products';
import type { BaseUom, ProductType, TrackingMode } from '@shared/enums';

/**
 * Parsing and checking a product CSV, before anything is sent.
 *
 * The rule this file exists to enforce is **preview then confirm**: a spreadsheet of 400 rows
 * is exactly the input most likely to be half-wrong, and an importer that posts as it parses
 * leaves the catalogue in a state nobody chose — 180 products created, row 181 rejected, and no
 * way to tell which is which without reading the list.
 *
 * So every row is validated locally first, against the *same* schemas the API uses, and the
 * user sees a per-row verdict before a single request goes out. The server still validates
 * everything it receives; this is a courtesy that makes the failure legible, not a substitute.
 */

/** The columns, and what each one accepts. This is what the template documents. */
export const CSV_COLUMNS = [
  { key: 'sku', required: true, note: 'Unique. Letters, digits, dot, dash, underscore.' },
  { key: 'name', required: true, note: 'Display name.' },
  { key: 'type', required: true, note: PRODUCT_TYPES.join(' | ') },
  { key: 'baseUom', required: true, note: BASE_UOMS.join(' | ') },
  { key: 'brand', required: false, note: 'Brand name; must already exist.' },
  { key: 'category', required: false, note: 'Category name; must already exist.' },
  { key: 'barcode', required: false, note: 'Unique across products, packs and variants.' },
  { key: 'mrp', required: false, note: 'Major units, e.g. 4500.00' },
  { key: 'sellPrice', required: false, note: 'Major units.' },
  { key: 'cost', required: false, note: 'Major units. Needs stock:viewCost.' },
  { key: 'taxRatePct', required: false, note: '0–100.' },
  { key: 'trackingMode', required: false, note: TRACKING_MODES.join(' | ') },
  { key: 'packCode', required: false, note: 'e.g. DOZ — one pack per row is supported.' },
  { key: 'packFactor', required: false, note: 'Base units per pack, ≥ 2.' },
  { key: 'packBarcode', required: false, note: 'Optional barcode for the pack.' },
  { key: 'description', required: false, note: '' },
] as const;

export interface ParsedRow {
  /** 1-based, matching what the spreadsheet shows — so "row 43" means row 43. */
  line: number;
  raw: Record<string, string>;
  body: CreateProductBody | null;
  errors: { column: string; message: string }[];
}

export interface ParseOutcome {
  rows: ParsedRow[];
  /** Problems with the file itself rather than a row — a missing column, say. */
  fatal: string[];
}

const clean = (value: string | undefined): string => (value ?? '').trim();

function parseMoney(value: string, column: string, errors: ParsedRow['errors']): number {
  if (value === '') return 0;
  const n = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) {
    errors.push({ column, message: `"${value}" is not an amount` });
    return 0;
  }
  return toMinor(n);
}

/**
 * One row → a request body, or a list of reasons why not.
 *
 * Brand and category arrive as *names*, because that is what a spreadsheet holds; they are
 * resolved to ids by the caller, which has the lists loaded.
 */
function parseRow(
  raw: Record<string, string>,
  line: number,
  lookups: { brands: Map<string, string>; categories: Map<string, string> },
): ParsedRow {
  const errors: ParsedRow['errors'] = [];
  const get = (key: string) => clean(raw[key]);

  const sku = get('sku').toUpperCase();
  const name = get('name');
  const type = get('type').toUpperCase() as ProductType;
  const baseUom = (get('baseUom').toUpperCase() || 'PCS') as BaseUom;

  if (!sku) errors.push({ column: 'sku', message: 'Required' });
  if (!name) errors.push({ column: 'name', message: 'Required' });

  if (!PRODUCT_TYPES.includes(type)) {
    errors.push({ column: 'type', message: `Must be one of ${PRODUCT_TYPES.join(', ')}` });
  }
  if (!BASE_UOMS.includes(baseUom)) {
    errors.push({ column: 'baseUom', message: `Must be one of ${BASE_UOMS.join(', ')}` });
  }

  const trackingRaw = get('trackingMode').toUpperCase();
  const trackingMode = (trackingRaw || 'NONE') as TrackingMode;
  if (trackingRaw && !TRACKING_MODES.includes(trackingMode)) {
    errors.push({
      column: 'trackingMode',
      message: `Must be one of ${TRACKING_MODES.join(', ')}`,
    });
  }

  // Brand and category are matched case-insensitively on name; an unknown one is an error
  // rather than a silent null, because silently unbranding 80 products is not a helpful import.
  let brandId: string | null = null;
  const brandName = get('brand');
  if (brandName) {
    const found = lookups.brands.get(brandName.toLowerCase());
    if (found) brandId = found;
    else errors.push({ column: 'brand', message: `No brand called "${brandName}"` });
  }

  let categoryId: string | null = null;
  const categoryName = get('category');
  if (categoryName) {
    const found = lookups.categories.get(categoryName.toLowerCase());
    if (found) categoryId = found;
    else errors.push({ column: 'category', message: `No category called "${categoryName}"` });
  }

  const mrpMinor = parseMoney(get('mrp'), 'mrp', errors);
  const sellMinor = parseMoney(get('sellPrice'), 'sellPrice', errors);
  const costMinor = parseMoney(get('cost'), 'cost', errors);

  let taxRatePct = 0;
  const taxRaw = get('taxRatePct');
  if (taxRaw !== '') {
    const n = Number(taxRaw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      errors.push({ column: 'taxRatePct', message: 'Must be between 0 and 100' });
    } else {
      taxRatePct = n;
    }
  }

  // One pack per row — enough for the DOZ that nearly every frame carries. A product needing
  // both DOZ and CTN is finished in the editor, which is a two-field job.
  const packs: CreateProductBody['packs'] = [];
  const packCode = get('packCode').toUpperCase();
  if (packCode) {
    const factor = Number(get('packFactor'));
    if (!Number.isFinite(factor)) {
      errors.push({ column: 'packFactor', message: 'Required when packCode is given' });
    } else {
      packs.push({
        code: packCode as never,
        name: packCode,
        factor,
        barcode: get('packBarcode') || null,
      });
      for (const problem of validatePacks(baseUom, packs)) {
        errors.push({
          column: `pack${problem.field === 'code' ? 'Code' : 'Factor'}`,
          message: problem.message,
        });
      }
    }
  }

  // Attributes are not columns — a CSV cannot sensibly carry a per-type union — so every
  // imported product starts with its type's defaults and is finished in the editor. Validating
  // here still catches a type whose required attrs cannot be defaulted.
  const attrs =
    type === 'LENS'
      ? { material: 'CR39', design: 'SV', soldAs: 'PAIR' }
      : type === 'ACCESSORY'
        ? { requiresExpiry: false }
        : type === 'MACHINE'
          ? { installationRequired: false }
          : { polarized: false, uvProtection: false, hasCase: false };

  if (PRODUCT_TYPES.includes(type)) {
    const check = productAttrsSchema.safeParse({ ...attrs, type });
    if (!check.success) {
      errors.push({ column: 'type', message: 'Cannot build default attributes for this type' });
    }
  }

  if (errors.length > 0) return { line, raw, body: null, errors };

  return {
    line,
    raw,
    errors: [],
    body: {
      sku,
      name,
      type,
      baseUom,
      brandId,
      categoryId,
      barcode: get('barcode') || null,
      description: get('description') || null,
      mrpMinor,
      defaultSellPriceMinor: sellMinor,
      standardCostMinor: costMinor,
      taxRatePct,
      trackingMode,
      packs,
      attrs,
    },
  };
}

/**
 * Parse a CSV file into checked rows.
 *
 * Duplicate SKUs *within the file* are caught here. The server would catch them too, but only
 * on the second one — by which time the first is already created, and the user is left
 * reconciling a partial import against a spreadsheet.
 */
export function parseProductCsv(
  text: string,
  lookups: { brands: Map<string, string>; categories: Map<string, string> },
): ParseOutcome {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const fatal: string[] = [];
  const headers = parsed.meta.fields ?? [];

  for (const column of CSV_COLUMNS) {
    if (column.required && !headers.includes(column.key)) {
      fatal.push(`Missing required column "${column.key}"`);
    }
  }

  const unknown = headers.filter((h) => !CSV_COLUMNS.some((c) => c.key === h));
  if (unknown.length > 0) {
    fatal.push(`Unrecognised column${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
  }

  if (fatal.length > 0) return { rows: [], fatal };

  // +2: one for the header line, one because spreadsheets count from 1.
  const rows = parsed.data.map((raw, index) => parseRow(raw, index + 2, lookups));

  const seen = new Map<string, number>();
  for (const row of rows) {
    const sku = clean(row.raw.sku).toUpperCase();
    if (!sku) continue;

    const first = seen.get(sku);
    if (first !== undefined) {
      row.errors.push({ column: 'sku', message: `Duplicate of row ${first} in this file` });
      row.body = null;
    } else {
      seen.set(sku, row.line);
    }
  }

  return { rows, fatal: [] };
}

/** A blank file with the right headers and one example row. */
export function csvTemplate(): string {
  const headers = CSV_COLUMNS.map((c) => c.key).join(',');
  const example = [
    'FRM-0001',
    'Aviator Classic',
    'FRAME',
    'PCS',
    '',
    '',
    '8901234567890',
    '4500.00',
    '3800.00',
    '2100.00',
    '0',
    'NONE',
    'DOZ',
    '12',
    '',
    'Metal aviator, gold',
  ].join(',');

  return `${headers}\n${example}\n`;
}
