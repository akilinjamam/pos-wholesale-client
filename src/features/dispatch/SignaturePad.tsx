import { Eraser } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

/**
 * A signature, drawn with a finger, a stylus or a mouse — proof of delivery captured at the
 * dealer's door on a phone or tablet. Pointer events cover all three; `touch-action: none` stops
 * the page from scrolling under the finger.
 *
 * Emits a PNG data URL on every stroke end (null when cleared or blank). Drawn black on a white
 * background, so it prints and photocopies as it looks.
 */
export function SignaturePad({
  onChange,
  disabled = false,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  // Size the backing store to the element and the screen's pixel ratio, once — a sharp line on a
  // retina tablet, without a 4 MB image.
  useEffect(() => {
    const c = ref.current!;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000';
  }, []);

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const clear = () => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const { width, height } = c.getBoundingClientRect();
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="space-y-1.5">
      <canvas
        ref={ref}
        aria-label="Signature — draw with a finger, stylus or mouse"
        className="h-36 w-full touch-none rounded-md border bg-white"
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = e.currentTarget.getContext('2d')!;
          const p = at(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + 0.1, p.y + 0.1); // a tap leaves a dot
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d')!;
          const p = at(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={(e) => {
          if (!drawing.current) return;
          drawing.current = false;
          setEmpty(false);
          onChange(e.currentTarget.toDataURL('image/png'));
        }}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{empty ? 'Sign above' : 'Signed'}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={empty || disabled}
        >
          <Eraser aria-hidden="true" />
          Clear
        </Button>
      </div>
    </div>
  );
}
