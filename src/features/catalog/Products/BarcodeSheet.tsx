import { Printer } from 'lucide-react';
import { useRef, useState } from 'react';
import Barcode from 'react-barcode';
import { useReactToPrint } from 'react-to-print';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { env } from '@/config/env';

import { formatMoney } from '@shared/money';

import type { ProductPayload } from '@shared/types';

/**
 * A printable sheet of barcode labels.
 *
 * Every label on a shelf or a carton comes from here, so the sheet has to match the stationery
 * the shop already buys — hence a chooser rather than a fixed grid. The three presets are the
 * common A4 label sheets; "custom" exists because the fourth one always turns up.
 *
 * Printing is `react-to-print`, which opens the browser's own dialog against a cloned node.
 * That matters for two reasons: the page's dark theme and app chrome must not reach the paper,
 * and a label printer driver expects a plain document rather than a screenshot of an app.
 *
 * **Which codes get printed** is the part that is easy to get wrong. A product may carry a
 * barcode of its own *and* one per pack, and they mean different quantities — scanning the
 * carton label is 144 pieces, not one. So each label prints its unit, and the sheet lets you
 * choose which of them you are actually labelling today.
 */

interface BarcodeSheetProps {
  open: boolean;
  onClose: () => void;
  /** The products selected on the list. */
  products: ProductPayload[];
}

interface Label {
  key: string;
  code: string;
  name: string;
  /** The unit one scan of this code means — PCS, DOZ, CTN. */
  uom: string;
  priceMinor: number;
}

const PRESETS = {
  '65': { label: '65 per sheet (38 × 21 mm)', columns: 5, width: 1.3, height: 34, font: 9 },
  '40': { label: '40 per sheet (48 × 25 mm)', columns: 4, width: 1.6, height: 44, font: 11 },
  '24': { label: '24 per sheet (64 × 34 mm)', columns: 3, width: 2, height: 60, font: 13 },
} as const;

type PresetKey = keyof typeof PRESETS;

export function BarcodeSheet({ open, onClose, products }: BarcodeSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  const [preset, setPreset] = useState<PresetKey>('40');
  const [copies, setCopies] = useState(1);
  const [includePacks, setIncludePacks] = useState(true);
  const [showPrice, setShowPrice] = useState(true);

  const print = useReactToPrint({
    contentRef: sheetRef,
    documentTitle: `Barcodes — ${products.length} product${products.length === 1 ? '' : 's'}`,
  });

  const { columns, width, height, font } = PRESETS[preset];

  /**
   * Flatten the selection into labels.
   *
   * A product with no barcode at all contributes nothing — printing a label with an empty code
   * wastes a sticker and, worse, looks like it worked.
   */
  const labels: Label[] = products.flatMap((product) => {
    const own: Label[] = product.barcode
      ? [
          {
            key: `${product.id}-base`,
            code: product.barcode,
            name: product.name,
            uom: product.baseUom,
            priceMinor: product.defaultSellPriceMinor,
          },
        ]
      : [];

    const packs: Label[] = includePacks
      ? product.packs
          .filter((pack) => pack.barcode)
          .map((pack) => ({
            key: `${product.id}-${pack.code}`,
            code: pack.barcode as string,
            name: product.name,
            uom: pack.code,
            // A pack's price is the unit price times its factor — what the label should say,
            // because that is what the pack costs.
            priceMinor: product.defaultSellPriceMinor * pack.factor,
          }))
      : [];

    return [...own, ...packs];
  });

  const repeated = labels.flatMap((label) =>
    Array.from({ length: copies }, (_, i) => ({ ...label, key: `${label.key}-${i}` })),
  );

  const withoutBarcodes = products.filter(
    (p) => !p.barcode && !p.packs.some((pack) => pack.barcode),
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Print barcode labels"
      description={`${products.length} product${products.length === 1 ? '' : 's'} selected.`}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => print()} disabled={repeated.length === 0}>
            <Printer aria-hidden="true" />
            Print {repeated.length > 0 && `(${repeated.length})`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label size" hint="Match the sheet you are printing on.">
            {(props) => (
              <Select
                {...props}
                value={preset}
                onChange={(e) => setPreset(e.target.value as PresetKey)}
              >
                {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
                  <option key={key} value={key}>
                    {PRESETS[key].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Copies of each">
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                max={50}
                value={copies}
                onChange={(e) =>
                  setCopies(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                }
              />
            )}
          </Field>
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={includePacks}
              onChange={(e) => setIncludePacks(e.target.checked)}
            />
            Include pack labels (DOZ, CTN)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={showPrice}
              onChange={(e) => setShowPrice(e.target.checked)}
            />
            Show price
          </label>
        </div>

        {withoutBarcodes.length > 0 && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            {withoutBarcodes.length} selected product
            {withoutBarcodes.length === 1 ? ' has' : 's have'} no barcode and will not print:{' '}
            {withoutBarcodes
              .slice(0, 3)
              .map((p) => p.name)
              .join(', ')}
            {withoutBarcodes.length > 3 && `, and ${withoutBarcodes.length - 3} more`}.
          </p>
        )}

        <div className="max-h-[22rem] overflow-y-auto rounded-lg border bg-white p-3">
          {/*
            The printed node. `bg-white` and explicit black text rather than theme tokens: the
            app may be in dark mode, and a sheet of white-on-black labels is both unreadable to
            a scanner and a cartridge of wasted ink.
          */}
          <div
            ref={sheetRef}
            className="grid gap-2 bg-white"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {repeated.map((label) => (
              <div
                key={label.key}
                className="flex break-inside-avoid flex-col items-center justify-center border border-dashed border-neutral-300 p-1 text-center text-black"
              >
                <span className="w-full truncate text-[10px] font-medium leading-tight">
                  {label.name}
                </span>
                <Barcode
                  value={label.code}
                  format="CODE128"
                  width={width}
                  height={height}
                  fontSize={font}
                  margin={2}
                  displayValue
                />
                <span className="text-[10px] leading-tight">
                  {label.uom}
                  {showPrice && (
                    <> · {formatMoney(label.priceMinor, { symbol: env.currencySymbol })}</>
                  )}
                </span>
              </div>
            ))}

            {repeated.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-neutral-500">
                Nothing to print — none of the selected products has a barcode.
              </p>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
