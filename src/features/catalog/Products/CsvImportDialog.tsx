import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from 'lucide-react';
import { useState } from 'react';

import { errorMessage, fieldErrors } from '@/api/client';
import { createProduct } from '@/api/endpoints/products';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { usePermission } from '@/hooks/data/useAuth';
import { useBrands } from '@/hooks/data/useBrands';
import { useCategories } from '@/hooks/data/useCategories';
import { productKeys } from '@/hooks/data/useProducts';
import { useQueryClient } from '@tanstack/react-query';

import { CSV_COLUMNS, csvTemplate, parseProductCsv } from './csvImport';

import type { ParsedRow } from './csvImport';

/**
 * Import products from a spreadsheet — preview, then confirm.
 *
 * Three states, and the middle one is the reason this exists:
 *
 *  1. **Choose** a file, or take the template.
 *  2. **Preview** — every row checked locally against the same schemas the API uses, with a
 *     per-row verdict. Nothing has been sent.
 *  3. **Result** — what was created, and a row-level report of what was not.
 *
 * An importer without step 2 leaves the catalogue in a state nobody chose: 180 products in, row
 * 181 rejected, and no way to tell which is which without reading the list against the file.
 *
 * Rows are posted **one at a time**, deliberately. There is no bulk endpoint, and inventing one
 * that half-succeeds would move this exact problem to the server. One request per row is slower
 * and completely legible: every failure names its row and its reason, and the rows that worked
 * are really there.
 */

type Stage = 'choose' | 'preview' | 'running' | 'done';

interface RowResult {
  line: number;
  sku: string;
  ok: boolean;
  message?: string;
}

export function CsvImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const canViewCost = usePermission('stock:viewCost');
  const queryClient = useQueryClient();

  const { data: brands } = useBrands({ limit: 200 });
  const { data: categories } = useCategories({ limit: 200 });

  const [stage, setStage] = useState<Stage>('choose');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fatal, setFatal] = useState<string[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [progress, setProgress] = useState(0);

  const valid = rows.filter((r) => r.body !== null);
  const invalid = rows.filter((r) => r.body === null);

  const onFile = async (file: File) => {
    const text = await file.text();

    const outcome = parseProductCsv(text, {
      brands: new Map((brands?.items ?? []).map((b) => [b.name.toLowerCase(), b.id])),
      categories: new Map((categories?.items ?? []).map((c) => [c.name.toLowerCase(), c.id])),
    });

    setFileName(file.name);
    setRows(outcome.rows);
    setFatal(outcome.fatal);
    setStage('preview');
  };

  const run = async () => {
    setStage('running');
    setProgress(0);

    const collected: RowResult[] = [];

    for (const [index, row] of valid.entries()) {
      const body = row.body;
      if (!body) continue;

      try {
        // `standardCostMinor` is dropped for a caller who cannot see cost — the field is absent
        // from every product they read, so sending one would be writing a number they were
        // never shown.
        const { standardCostMinor: _cost, ...withoutCost } = body;
        await createProduct(canViewCost ? body : (withoutCost as typeof body));
        collected.push({ line: row.line, sku: body.sku, ok: true });
      } catch (error) {
        const fields = fieldErrors(error);
        collected.push({
          line: row.line,
          sku: body.sku,
          ok: false,
          message: fields.length
            ? fields.map((f) => `${f.path}: ${f.message}`).join('; ')
            : errorMessage(error),
        });
      }

      setProgress(index + 1);
    }

    setResults(collected);
    void queryClient.invalidateQueries({ queryKey: productKeys.all });
    setStage('done');
  };

  const downloadTemplate = () => {
    const blob = new Blob([csvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'products-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const created = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  return (
    <Dialog
      open={open}
      onClose={stage === 'running' ? () => undefined : onClose}
      title="Import products from CSV"
      description={
        stage === 'preview'
          ? `${fileName} — nothing has been imported yet.`
          : stage === 'done'
            ? 'Finished.'
            : 'Every row is checked before anything is sent.'
      }
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={stage === 'running'}>
            {stage === 'done' ? 'Close' : 'Cancel'}
          </Button>

          {stage === 'preview' && (
            <Button onClick={run} disabled={valid.length === 0}>
              <Upload aria-hidden="true" />
              Import {valid.length} row{valid.length === 1 ? '' : 's'}
            </Button>
          )}

          {stage === 'running' && (
            <Button disabled>
              <Loader2 className="animate-spin" aria-hidden="true" />
              {progress} of {valid.length}
            </Button>
          )}
        </>
      }
    >
      {stage === 'choose' && (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-colors hover:bg-accent/40">
            <Upload className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">Choose a CSV file</span>
            <span className="text-xs text-muted-foreground">
              The first row must be the column headers.
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
          </label>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              Not sure of the format? The template has every column and one example row.
            </p>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download aria-hidden="true" />
              Template
            </Button>
          </div>

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Columns</summary>
            <dl className="mt-3 space-y-1.5">
              {CSV_COLUMNS.map((column) => (
                <div key={column.key} className="flex gap-3 text-xs">
                  <dt className="w-28 shrink-0 font-mono">
                    {column.key}
                    {column.required && <span className="text-destructive">*</span>}
                  </dt>
                  <dd className="text-muted-foreground">{column.note}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              Type-specific attributes are not columns — a spreadsheet cannot carry a different
              shape per product type. Imported products get their type&rsquo;s defaults and are
              finished in the editor.
            </p>
          </details>
        </div>
      )}

      {stage === 'preview' && (
        <div className="space-y-4">
          {fatal.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                This file cannot be read
              </p>
              <ul className="list-inside list-disc text-xs text-destructive">
                {fatal.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                  <strong>{valid.length}</strong> ready
                </span>
                {invalid.length > 0 && (
                  <span className="flex items-center gap-1.5 text-destructive">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    <strong>{invalid.length}</strong> will be skipped
                  </span>
                )}
              </div>

              <RowReport rows={rows} />
            </>
          )}
        </div>
      )}

      {stage === 'running' && (
        <div className="space-y-3 py-6">
          <p className="text-center text-sm text-muted-foreground">
            Importing row {progress} of {valid.length}…
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${valid.length ? (progress / valid.length) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
              <strong>{created}</strong> created
            </span>
            {failed.length > 0 && (
              <span className="flex items-center gap-1.5 text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <strong>{failed.length}</strong> rejected by the server
              </span>
            )}
            {invalid.length > 0 && (
              <span className="text-muted-foreground">
                <strong>{invalid.length}</strong> skipped before sending
              </span>
            )}
          </div>

          {failed.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium">Row</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">SKU</th>
                    <th className="px-3 py-2 text-left text-xs font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {failed.map((result) => (
                    <tr key={result.line} className="border-b last:border-0">
                      <td className="px-3 py-1.5 tabular-nums">{result.line}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{result.sku}</td>
                      <td className="px-3 py-1.5 text-xs text-destructive">{result.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {failed.length === 0 && invalid.length === 0 && (
            <EmptyState
              icon={CheckCircle2}
              title="Every row imported"
              description={`${created} product${created === 1 ? '' : 's'} added to the catalogue.`}
            />
          )}
        </div>
      )}
    </Dialog>
  );
}

/**
 * The per-row verdict.
 *
 * Rows with problems are listed first: with 400 rows and 3 mistakes, the mistakes are the
 * entire reason anyone is reading this table.
 */
function RowReport({ rows }: { rows: ParsedRow[] }) {
  const ordered = [...rows].sort((a, b) => {
    const aBad = a.body === null ? 0 : 1;
    const bBad = b.body === null ? 0 : 1;
    return aBad - bBad || a.line - b.line;
  });

  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 border-b bg-muted">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium">Row</th>
            <th className="px-3 py-2 text-left text-xs font-medium">SKU</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Name</th>
            <th className="px-3 py-2 text-left text-xs font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((row) => (
            <tr key={row.line} className="border-b last:border-0">
              <td className="px-3 py-1.5 tabular-nums">{row.line}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{row.raw.sku || '—'}</td>
              <td className="max-w-[14rem] truncate px-3 py-1.5">{row.raw.name || '—'}</td>
              <td className="px-3 py-1.5 text-xs">
                {row.errors.length === 0 ? (
                  <span className="text-success">Ready</span>
                ) : (
                  <span className="text-destructive">
                    {row.errors.map((e) => `${e.column}: ${e.message}`).join('; ')}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
