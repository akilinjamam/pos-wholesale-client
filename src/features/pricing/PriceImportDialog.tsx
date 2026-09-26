import { CheckCircle2, Download, FileWarning, Loader2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';

import { StatusPill } from '@/components/common/StatusPill';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useImportPriceEntries } from '@/hooks/data/usePricing';

import { PRICE_CSV_COLUMNS, parsePriceCsv, priceCsvTemplate } from './priceCsv';

import type { LocalRow } from './priceCsv';
import type { PriceScope } from './scope';
import type { PriceImportResult } from '@shared/types';

/**
 * Import a price list from CSV — **preview, then confirm**.
 *
 *  1. The file is parsed in the browser and each row checked for what the file alone can get
 *     wrong.
 *  2. The rows that pass go to the server as a **dry run**, which resolves SKUs and units and
 *     checks every row against the prices already on file and against the other rows.
 *  3. The user sees every row's verdict — add, update, or the reasons it cannot — and only then
 *     confirms. The commit writes the valid rows in one transaction.
 *
 * A row matching an existing price exactly (same product, unit, break and start date) *updates*
 * it, so re-importing next season's sheet re-prices instead of failing.
 */

type Verdict = {
  line: number;
  sku: string;
  status: 'CREATE' | 'UPDATE' | 'ERROR';
  detail: string;
};

export interface PriceImportDialogProps {
  open: boolean;
  onClose: () => void;
  scope: PriceScope;
  scopeLabel: string;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function PriceImportDialog({
  open,
  onClose,
  scope,
  scopeLabel,
}: PriceImportDialogProps) {
  const importEntries = useImportPriceEntries();
  const [fileName, setFileName] = useState<string | null>(null);
  const [local, setLocal] = useState<LocalRow[]>([]);
  const [fatal, setFatal] = useState<string[]>([]);
  const [preview, setPreview] = useState<PriceImportResult | null>(null);

  const sendable = useMemo(() => local.flatMap((r) => (r.row ? [r.row] : [])), [local]);

  const onFile = async (file: File | undefined) => {
    setPreview(null);
    if (!file) return;
    setFileName(file.name);

    const parsed = parsePriceCsv(await file.text());
    setLocal(parsed.rows);
    setFatal(parsed.fatal);

    const rows = parsed.rows.flatMap((r) => (r.row ? [r.row] : []));
    if (parsed.fatal.length === 0 && rows.length > 0) {
      importEntries.mutate({ ...scope, rows, dryRun: true }, { onSuccess: setPreview });
    }
  };

  const commit = () =>
    importEntries.mutate({ ...scope, rows: sendable, dryRun: false }, { onSuccess: onClose });

  // Local failures and server verdicts, merged into one list in file order.
  const verdicts: Verdict[] = useMemo(() => {
    const serverBy = new Map((preview?.rows ?? []).map((r) => [r.line, r]));
    return local.map((r) => {
      const sku = r.row?.sku ?? r.raw.sku ?? '';
      if (!r.row) return { line: r.line, sku, status: 'ERROR', detail: r.errors.join('; ') };
      const s = serverBy.get(r.line);
      if (!s) return { line: r.line, sku, status: 'CREATE', detail: '…' };
      return {
        line: r.line,
        sku,
        status: s.status,
        detail:
          s.status === 'ERROR'
            ? s.errors.join('; ')
            : [s.productName, s.variantLabel].filter(Boolean).join(' · '),
      };
    });
  }, [local, preview]);

  const counts = {
    create: verdicts.filter((v) => v.status === 'CREATE').length,
    update: verdicts.filter((v) => v.status === 'UPDATE').length,
    error: verdicts.filter((v) => v.status === 'ERROR').length,
  };
  const ready = preview !== null && counts.create + counts.update > 0;
  const checking = importEntries.isPending && !preview;

  return (
    <Dialog
      open={open}
      onClose={importEntries.isPending ? () => undefined : onClose}
      title={`Import prices — ${scopeLabel}`}
      description="Nothing is written until you confirm. Rows with problems are skipped, never half-imported."
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={importEntries.isPending}>
            Cancel
          </Button>
          <Button onClick={commit} disabled={!ready || importEntries.isPending}>
            {importEntries.isPending && preview && (
              <Loader2 className="animate-spin" aria-hidden="true" />
            )}
            {ready
              ? `Import ${counts.create + counts.update} row(s)${counts.error ? `, skip ${counts.error}` : ''}`
              : 'Import'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
            <Upload className="h-4 w-4" aria-hidden="true" />
            {fileName ?? 'Choose a CSV file'}
            <Input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => download('price-list-template.csv', priceCsvTemplate())}
          >
            <Download aria-hidden="true" />
            Template
          </Button>
        </div>

        {!fileName && (
          <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            {PRICE_CSV_COLUMNS.map((c) => (
              <li key={c.key}>
                <code className="font-mono text-foreground">{c.key}</code>
                {c.required && <span className="text-destructive">*</span>} — {c.note}
              </li>
            ))}
          </ul>
        )}

        {fatal.length > 0 && (
          <div
            role="alert"
            className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            <FileWarning className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div>{fatal.join(' ')}</div>
          </div>
        )}

        {checking && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Checking {sendable.length} row(s) against the catalogue and existing prices…
          </p>
        )}

        {verdicts.length > 0 && !checking && (
          <>
            <p className="flex flex-wrap items-center gap-3 text-sm" aria-live="polite">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              <span>{counts.create} new</span>
              <span>{counts.update} update existing</span>
              <span className={counts.error ? 'font-medium text-destructive' : undefined}>
                {counts.error} with problems
              </span>
            </p>
            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {verdicts.map((v) => (
                    <TableRow key={v.line}>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {v.line}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                      <TableCell>
                        <StatusPill
                          status={v.status}
                          tone={
                            v.status === 'ERROR'
                              ? 'danger'
                              : v.status === 'UPDATE'
                                ? 'info'
                                : 'success'
                          }
                          label={
                            v.status === 'ERROR'
                              ? 'Skip'
                              : v.status === 'UPDATE'
                                ? 'Update'
                                : 'Add'
                          }
                        />
                      </TableCell>
                      <TableCell
                        className={
                          v.status === 'ERROR'
                            ? 'text-sm text-destructive'
                            : 'text-sm text-muted-foreground'
                        }
                      >
                        {v.detail}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
