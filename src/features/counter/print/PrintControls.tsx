import { FileText, Printer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useOrg } from '@/hooks/data/useOrg';

import { A4Invoice, OffScreen, ThermalReceipt } from './PrintDocs';
import { loadPrintSettings, savePrintSettings, usePrint } from './printHelpers';

import type { PrintSettings } from './printHelpers';
import type { PosSaleResult } from '@shared/types';

/**
 * Print buttons for one sale — the thermal receipt and the A4 invoice. **P** prints the receipt
 * and **A** the A4 while this is on screen (`keys`), and `auto` prints the receipt once on mount
 * when the till is set to print every sale.
 */
export function ReceiptButtons({
  sale,
  keys = false,
  auto = false,
  reprint = false,
}: {
  sale: PosSaleResult;
  keys?: boolean;
  auto?: boolean;
  reprint?: boolean;
}) {
  const { data: org } = useOrg();
  const [settings] = useState(loadPrintSettings);
  const receiptRef = useRef<HTMLDivElement>(null);
  const printReceipt = usePrint(receiptRef, settings.paper, `Receipt ${sale.invoice.docNo}`);
  const a4Ref = useRef<HTMLDivElement>(null);
  const printA4 = usePrint(a4Ref, 'A4', `Invoice ${sale.invoice.docNo}`);

  // Once per sale, and only after the org (the receipt header) has arrived.
  const autoDone = useRef(false);
  useEffect(() => {
    if (!auto || !settings.autoPrint || autoDone.current || !org) return;
    autoDone.current = true;
    printReceipt();
  }, [auto, settings.autoPrint, org, printReceipt]);

  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        printReceipt();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        printA4();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [keys, printReceipt, printA4]);

  return (
    <>
      <Button variant="outline" onClick={printReceipt}>
        <Printer aria-hidden="true" />
        Receipt{keys ? ' (P)' : ''}
      </Button>
      <Button variant="outline" onClick={printA4}>
        <FileText aria-hidden="true" />
        A4{keys ? ' (A)' : ''}
      </Button>
      <OffScreen>
        <ThermalReceipt
          ref={receiptRef}
          sale={sale}
          org={org}
          paper={settings.paper}
          footer={settings.footer}
          reprint={reprint}
        />
        <A4Invoice ref={a4Ref} sale={sale} org={org} />
      </OffScreen>
    </>
  );
}

/** This till's printer: roll width, print-every-sale, and the receipt's footer line. */
export function PrintSettingsDialog({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<PrintSettings>(loadPrintSettings);
  const save = () => {
    savePrintSettings(s);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Receipt printer"
      description="Saved on this till only — each counter can have its own printer."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Paper roll">
          {(p) => (
            <Select
              {...p}
              data-autofocus
              value={s.paper}
              onChange={(e) => setS({ ...s, paper: e.target.value as '80' | '58' })}
            >
              <option value="80">80 mm</option>
              <option value="58">58 mm</option>
            </Select>
          )}
        </Field>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Print a receipt for every sale
            <span className="block text-xs text-muted-foreground">
              Otherwise press P on the finished-sale screen.
            </span>
          </span>
          <Switch checked={s.autoPrint} onCheckedChange={(v) => setS({ ...s, autoPrint: v })} />
        </label>
        <Field label="Receipt footer">
          {(p) => (
            <Input
              {...p}
              value={s.footer}
              maxLength={120}
              onChange={(e) => setS({ ...s, footer: e.target.value })}
            />
          )}
        </Field>
        <p className="text-xs text-muted-foreground">
          To print without the browser’s dialog, make the thermal printer this computer’s
          default and start the browser in kiosk-printing mode (Chrome:{' '}
          <code>--kiosk-printing</code>).
        </p>
      </div>
    </Dialog>
  );
}
