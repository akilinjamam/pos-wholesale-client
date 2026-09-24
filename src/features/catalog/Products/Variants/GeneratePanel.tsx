import { Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { errorMessage, fieldErrors } from '@/api/client';
import { generateVariants } from '@/api/endpoints/variants';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useGenerateVariants } from '@/hooks/data/useVariants';

import type { GenerateVariantsBody, GenerateResult } from '@/api/endpoints/variants';
import type { LensGrid } from '@shared/catalog';
import type { ProductPayload } from '@shared/types';

/**
 * "Generate power range" — bounded by what the product declares.
 *
 * The bounds default to the product's own grid, so the common case ("everything I said was
 * legal") is one click. Anything narrower is allowed; anything wider is refused by the server,
 * which is the Day-7 rule and is enforced there rather than trusted from here.
 *
 * The live count is the reason this is not just a button. Generating is the one action in the
 * catalogue that can create a thousand documents, and "this will create 1,241 variants, 15
 * already exist" is the difference between a considered click and an accident. It comes from
 * the same endpoint with `dryRun: true`, so the number shown is the number the server computed
 * — not a formula the client re-derives and gets subtly wrong.
 */

interface GeneratePanelProps {
  product: ProductPayload;
  onDone: () => void;
}

/** Comma- or space-separated free text → a clean list. Empty entries are dropped. */
function parseList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseNumbers(value: string): number[] {
  return parseList(value)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

export function GeneratePanel({ product, onDone }: GeneratePanelProps) {
  const grid: LensGrid | null =
    product.attrs.type === 'LENS' ? (product.attrs.grid ?? null) : null;

  const varies = (axis: string) => product.variantAxes.includes(axis as never);

  // Seeded from the declared grid, so the default is "everything legal".
  const [sphFrom, setSphFrom] = useState(grid ? String(grid.sphMin) : '');
  const [sphTo, setSphTo] = useState(grid ? String(grid.sphMax) : '');
  const [cylFrom, setCylFrom] = useState(grid ? String(grid.cylMin) : '');
  const [cylTo, setCylTo] = useState(grid ? String(grid.cylMax) : '');
  const [addFrom, setAddFrom] = useState(grid?.addMin != null ? String(grid.addMin) : '');
  const [addTo, setAddTo] = useState(grid?.addMax != null ? String(grid.addMax) : '');
  const [axesText, setAxesText] = useState('');
  const [colorsText, setColorsText] = useState('');
  const [sizesText, setSizesText] = useState('');

  const [preview, setPreview] = useState<GenerateResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const generate = useGenerateVariants();

  const body = (): GenerateVariantsBody => {
    const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
    return {
      productId: product.id,
      ...(varies('sph') ? { sphFrom: num(sphFrom), sphTo: num(sphTo) } : {}),
      ...(varies('cyl') ? { cylFrom: num(cylFrom), cylTo: num(cylTo) } : {}),
      ...(varies('add') ? { addFrom: num(addFrom), addTo: num(addTo) } : {}),
      ...(varies('axis') && axesText.trim() ? { axes: parseNumbers(axesText) } : {}),
      ...(varies('color') ? { colors: parseList(colorsText) } : {}),
      ...(varies('size') ? { sizes: parseList(sizesText) } : {}),
    };
  };

  /**
   * Re-price the request whenever a bound changes, debounced.
   *
   * Deliberately tolerant of failure: a half-typed "-" is not a valid number, and the preview
   * quietly says nothing rather than flashing an error at someone mid-keystroke. The real
   * generate reports properly.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewing(true);
      generateVariants({ ...body(), dryRun: true })
        .then((result) => {
          setPreview(result);
          setPreviewError(null);
        })
        .catch((error: unknown) => {
          setPreview(null);
          const fields = fieldErrors(error);
          setPreviewError(fields[0]?.message ?? errorMessage(error));
        })
        .finally(() => setPreviewing(false));
    }, 350);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `body` is rebuilt each render
  }, [sphFrom, sphTo, cylFrom, cylTo, addFrom, addTo, axesText, colorsText, sizesText]);

  const onGenerate = () => {
    generate.mutate(body(), {
      onSuccess: onDone,
      onError: (error) => {
        const fields = fieldErrors(error);
        toast.error(fields[0]?.message ?? errorMessage(error));
      },
    });
  };

  const nothingToDo = preview !== null && preview.created === 0;

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <div>
        <p className="text-sm font-medium">Generate variants</p>
        <p className="text-xs text-muted-foreground">
          {grid
            ? `Bounded by the range declared on the product: sphere ${grid.sphMin} to ${grid.sphMax}, cylinder ${grid.cylMin} to ${grid.cylMax}, in ${grid.step} steps.`
            : 'Give the values to cross. Every combination becomes one variant.'}
        </p>
      </div>

      {varies('sph') && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sphere from">
            {(props) => (
              <Input
                {...props}
                value={sphFrom}
                onChange={(e) => setSphFrom(e.target.value)}
                type="number"
                step="0.25"
              />
            )}
          </Field>
          <Field label="Sphere to">
            {(props) => (
              <Input
                {...props}
                value={sphTo}
                onChange={(e) => setSphTo(e.target.value)}
                type="number"
                step="0.25"
              />
            )}
          </Field>
        </div>
      )}

      {varies('cyl') && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cylinder from">
            {(props) => (
              <Input
                {...props}
                value={cylFrom}
                onChange={(e) => setCylFrom(e.target.value)}
                type="number"
                step="0.25"
              />
            )}
          </Field>
          <Field label="Cylinder to">
            {(props) => (
              <Input
                {...props}
                value={cylTo}
                onChange={(e) => setCylTo(e.target.value)}
                type="number"
                step="0.25"
              />
            )}
          </Field>
        </div>
      )}

      {varies('add') && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Addition from">
            {(props) => (
              <Input
                {...props}
                value={addFrom}
                onChange={(e) => setAddFrom(e.target.value)}
                type="number"
                step="0.25"
              />
            )}
          </Field>
          <Field label="Addition to">
            {(props) => (
              <Input
                {...props}
                value={addTo}
                onChange={(e) => setAddTo(e.target.value)}
                type="number"
                step="0.25"
              />
            )}
          </Field>
        </div>
      )}

      {varies('axis') && (
        <Field
          label="Cylinder axes"
          hint="Comma separated, e.g. 0, 90, 180. Leave blank for axis 0 only — a full sweep multiplies the count by 181."
        >
          {(props) => (
            <Input
              {...props}
              value={axesText}
              onChange={(e) => setAxesText(e.target.value)}
              placeholder="0, 90, 180"
            />
          )}
        </Field>
      )}

      {varies('color') && (
        <Field label="Colours" hint="Comma separated.">
          {(props) => (
            <Input
              {...props}
              value={colorsText}
              onChange={(e) => setColorsText(e.target.value)}
              placeholder="Black, Gold, Gunmetal"
            />
          )}
        </Field>
      )}

      {varies('size') && (
        <Field label="Sizes" hint="Comma separated.">
          {(props) => (
            <Input
              {...props}
              value={sizesText}
              onChange={(e) => setSizesText(e.target.value)}
              placeholder="52, 54, 56"
            />
          )}
        </Field>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="text-sm" aria-live="polite">
          {previewing && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Counting…
            </span>
          )}
          {!previewing && previewError && (
            <span className="text-destructive">{previewError}</span>
          )}
          {!previewing && !previewError && preview && (
            <>
              <span className="font-medium">
                {preview.created.toLocaleString('en-US')} to create
              </span>
              {preview.skipped > 0 && (
                <span className="text-muted-foreground">
                  {' '}
                  · {preview.skipped.toLocaleString('en-US')} already exist
                </span>
              )}
            </>
          )}
        </p>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onDone} disabled={generate.isPending}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onGenerate}
            disabled={generate.isPending || previewing || Boolean(previewError) || nothingToDo}
          >
            {generate.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            Generate
          </Button>
        </div>
      </div>
    </div>
  );
}
